use serde::{Deserialize, Serialize};
use std::io::Read as IoRead;
use std::io::Write as IoWrite;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
    /// Unix timestamp (seconds) when the token was obtained
    pub obtained_at: u64,
}

impl GoogleTokens {
    pub fn is_expired(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Consider expired 60s before actual expiry for safety margin
        now >= self.obtained_at + self.expires_in.saturating_sub(60)
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    token_type: String,
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Generate a cryptographically random string for CSRF state and PKCE
fn random_string(len: usize) -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut result = String::with_capacity(len);
    let charset = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for i in 0..len {
        let s = RandomState::new();
        let mut hasher = s.build_hasher();
        hasher.write_usize(i);
        let idx = (hasher.finish() as usize) % charset.len();
        result.push(charset[idx] as char);
    }
    result
}

/// Start OAuth2 flow: opens browser and waits for callback on a local port.
/// Returns the authorization code and port. Uses CSRF state parameter.
/// Runs blocking TCP listener in spawn_blocking to not block the async runtime.
pub async fn start_oauth_flow(
    client_id: &str,
    scopes: &str,
) -> Result<(String, u16), String> {
    let client_id = client_id.to_string();
    let scopes = scopes.to_string();

    // Generate CSRF state parameter
    let state = random_string(32);
    let state_clone = state.clone();

    // Generate PKCE code_verifier (43-128 chars)
    let code_verifier = random_string(64);

    // Run the blocking TCP listener in a separate thread with timeout
    let result = tokio::task::spawn_blocking(move || {
        // Find a free port
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let redirect_uri = format!("http://127.0.0.1:{}", port);

        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
            client_id={}&\
            redirect_uri={}&\
            response_type=code&\
            scope={}&\
            access_type=offline&\
            prompt=consent&\
            state={}&\
            code_challenge={}&\
            code_challenge_method=plain",
            urlencoding(&client_id),
            urlencoding(&redirect_uri),
            urlencoding(&scopes),
            urlencoding(&state_clone),
            urlencoding(&code_verifier),
        );

        // Open browser
        open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

        // Set timeout on the listener (120 seconds)
        listener
            .set_nonblocking(false)
            .map_err(|e| e.to_string())?;
        let timeout = std::time::Duration::from_secs(120);
        listener.set_nonblocking(false).ok();
        // Use SO_RCVTIMEO via raw socket timeout
        // Fallback: set_nonblocking + poll loop
        let start = std::time::Instant::now();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;

        let stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if start.elapsed() > timeout {
                        return Err("OAuth timeout: no response received within 120 seconds. Please try again.".to_string());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            }
        };

        let mut stream = stream;
        // Read with timeout
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).ok();
        let mut buf = Vec::new();
        let mut tmp = [0u8; 4096];
        // Read until we have the full first line at minimum
        loop {
            match stream.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => {
                    buf.extend_from_slice(&tmp[..n]);
                    // Check if we've received the full HTTP request header
                    if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 8192 {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        let request = String::from_utf8_lossy(&buf);

        // Verify CSRF state parameter
        let returned_state = extract_param(&request, "state");
        if returned_state.as_deref() != Some(&state_clone) {
            let response = "HTTP/1.1 403 Forbidden\r\n\
                Content-Type: text/html\r\n\
                Cache-Control: no-store\r\n\
                X-Content-Type-Options: nosniff\r\n\r\n\
                <html><body style=\"font-family:sans-serif;text-align:center;padding:60px\">\
                <h2>Authorization failed</h2>\
                <p>State parameter mismatch. This could indicate a CSRF attack.</p>\
                </body></html>";
            let _ = stream.write_all(response.as_bytes());
            return Err("OAuth state mismatch: possible CSRF attack. Please try again.".to_string());
        }

        // Check for errors from Google
        if let Some(error) = extract_param(&request, "error") {
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
                Content-Type: text/html\r\n\
                Cache-Control: no-store\r\n\
                X-Content-Type-Options: nosniff\r\n\r\n\
                <html><body style=\"font-family:sans-serif;text-align:center;padding:60px\">\
                <h2>Authorization denied</h2>\
                <p>{}</p>\
                </body></html>",
                error
            );
            let _ = stream.write_all(response.as_bytes());
            return Err(format!("OAuth denied: {}", error));
        }

        // Extract code from GET /?code=...&scope=...&state=...
        let code = extract_param(&request, "code")
            .ok_or_else(|| "No authorization code in callback".to_string())?;

        // Send success response with security headers
        let response = "HTTP/1.1 200 OK\r\n\
            Content-Type: text/html\r\n\
            Cache-Control: no-store\r\n\
            X-Content-Type-Options: nosniff\r\n\r\n\
            <html><body style=\"font-family:sans-serif;text-align:center;padding:60px\">\
            <h2>Authorization successful!</h2>\
            <p>You can close this window and return to ScreamingCAT.</p>\
            <script>window.close()</script>\
            </body></html>";
        let _ = stream.write_all(response.as_bytes());

        Ok((code, port, code_verifier))
    })
    .await
    .map_err(|e| format!("OAuth task failed: {}", e))?;

    let (code, port, _code_verifier) = result?;
    Ok((code, port))
}

/// Exchange authorization code for tokens
pub async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_port: u16,
) -> Result<GoogleTokens, String> {
    let redirect_uri = format!("http://127.0.0.1:{}", redirect_port);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", &redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    if !resp.status().is_success() {
        let _text = resp.text().await.unwrap_or_default();
        return Err("Token exchange failed. Please check your OAuth credentials and try again.".to_string());
    }

    let token_resp: TokenResponse = resp
        .json()
        .await
        .map_err(|_| "Failed to parse token response".to_string())?;

    Ok(GoogleTokens {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
        expires_in: token_resp.expires_in,
        token_type: token_resp.token_type,
        obtained_at: now_unix(),
    })
}

/// Refresh an expired access token
pub async fn refresh_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<GoogleTokens, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !resp.status().is_success() {
        let _text = resp.text().await.unwrap_or_default();
        return Err("Token refresh failed. Please reconnect the integration.".to_string());
    }

    let token_resp: TokenResponse = resp
        .json()
        .await
        .map_err(|_| "Failed to parse refresh response".to_string())?;

    Ok(GoogleTokens {
        access_token: token_resp.access_token,
        refresh_token: Some(refresh_token.to_string()),
        expires_in: token_resp.expires_in,
        token_type: token_resp.token_type,
        obtained_at: now_unix(),
    })
}

fn extract_param(request: &str, key: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        let v = parts.next()?;
        if k == key {
            return Some(urldecoding(v));
        }
    }
    None
}

fn urlencoding(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

fn urldecoding(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            result.push(b' ');
            i += 1;
            continue;
        }
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &String::from_utf8_lossy(&bytes[i + 1..i + 3]),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}
