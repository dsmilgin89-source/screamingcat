use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotMeta {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub url_count: u32,
    pub created_at: String,
    // Extended stats for history comparison
    #[serde(default)]
    pub status_2xx: u32,
    #[serde(default)]
    pub status_3xx: u32,
    #[serde(default)]
    pub status_4xx: u32,
    #[serde(default)]
    pub status_5xx: u32,
    #[serde(default)]
    pub avg_response_ms: u64,
    #[serde(default)]
    pub indexable_count: u32,
    #[serde(default)]
    pub non_indexable_count: u32,
    #[serde(default)]
    pub total_word_count: u64,
    #[serde(default)]
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotRow {
    pub url: String,
    pub status_code: u16,
    pub title: String,
    pub meta_description: String,
    pub h1: String,
    pub word_count: u32,
    pub canonical: String,
    pub indexable: bool,
    pub content_hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UrlDiff {
    pub url: String,
    pub field: String,
    pub old_value: String,
    pub new_value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CrawlComparison {
    pub added_urls: Vec<String>,
    pub removed_urls: Vec<String>,
    pub changed: Vec<UrlDiff>,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct StorageConfig {
    pub custom_path: String, // empty = default location
    pub retention_days: u32, // 0 = forever
    pub max_snapshots: u32,  // 0 = unlimited
    pub auto_save: bool,     // auto-save after each crawl
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageStats {
    pub total_snapshots: u32,
    pub total_size_bytes: u64,
    pub storage_path: String,
    pub oldest_snapshot: String,
    pub newest_snapshot: String,
    pub domains: Vec<DomainStats>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DomainStats {
    pub domain: String,
    pub snapshot_count: u32,
    pub latest_crawl: String,
    pub total_size_bytes: u64,
}

pub fn get_snapshots_dir_with_config(config: &StorageConfig) -> PathBuf {
    let dir = if !config.custom_path.is_empty() {
        PathBuf::from(&config.custom_path)
    } else {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("screamingcat")
            .join("snapshots")
    };
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub fn save_snapshot_with_config(
    meta: &SnapshotMeta,
    rows: &[SnapshotRow],
    config: &StorageConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_snapshots_dir_with_config(config);

    // Write rows to {id}.json
    let rows_path = dir.join(format!("{}.json", meta.id));
    let rows_json = serde_json::to_string(rows)?;
    std::fs::write(&rows_path, &rows_json)?;

    // Update meta with actual file size
    let mut meta = meta.clone();
    meta.size_bytes = rows_json.len() as u64;

    // Update index.json
    let index_path = dir.join("index.json");
    let mut index: Vec<SnapshotMeta> = if index_path.exists() {
        let data = std::fs::read_to_string(&index_path)?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    };
    index.push(meta);
    let index_json = serde_json::to_string_pretty(&index)?;
    std::fs::write(&index_path, index_json)?;

    // Apply retention policies
    enforce_retention(&dir, config);

    Ok(())
}

pub fn list_snapshots_with_config(config: &StorageConfig) -> Vec<SnapshotMeta> {
    let index_path = get_snapshots_dir_with_config(config).join("index.json");
    if !index_path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(&index_path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => vec![],
    }
}

pub fn delete_snapshot_with_config(
    id: &str,
    config: &StorageConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_snapshots_dir_with_config(config);

    // Remove {id}.json
    let rows_path = dir.join(format!("{}.json", id));
    if rows_path.exists() {
        std::fs::remove_file(&rows_path)?;
    }

    // Remove entry from index.json
    let index_path = dir.join("index.json");
    if index_path.exists() {
        let data = std::fs::read_to_string(&index_path)?;
        let mut index: Vec<SnapshotMeta> = serde_json::from_str(&data).unwrap_or_default();
        index.retain(|m| m.id != id);
        let index_json = serde_json::to_string_pretty(&index)?;
        std::fs::write(&index_path, index_json)?;
    }

    Ok(())
}

pub fn compare_snapshots_with_config(
    id_a: &str,
    id_b: &str,
    config: &StorageConfig,
) -> Result<CrawlComparison, Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_snapshots_dir_with_config(config);

    let data_a = std::fs::read_to_string(dir.join(format!("{}.json", id_a)))?;
    let rows_a: Vec<SnapshotRow> = serde_json::from_str(&data_a)?;

    let data_b = std::fs::read_to_string(dir.join(format!("{}.json", id_b)))?;
    let rows_b: Vec<SnapshotRow> = serde_json::from_str(&data_b)?;

    let map_a: HashMap<String, &SnapshotRow> = rows_a.iter().map(|r| (r.url.clone(), r)).collect();
    let map_b: HashMap<String, &SnapshotRow> = rows_b.iter().map(|r| (r.url.clone(), r)).collect();

    let added_urls: Vec<String> = map_b
        .keys()
        .filter(|url| !map_a.contains_key(*url))
        .cloned()
        .collect();

    let removed_urls: Vec<String> = map_a
        .keys()
        .filter(|url| !map_b.contains_key(*url))
        .cloned()
        .collect();

    let mut changed: Vec<UrlDiff> = Vec::new();
    for (url, row_a) in &map_a {
        if let Some(row_b) = map_b.get(url) {
            let fields: Vec<(&str, String, String)> = vec![
                (
                    "status_code",
                    row_a.status_code.to_string(),
                    row_b.status_code.to_string(),
                ),
                ("title", row_a.title.clone(), row_b.title.clone()),
                (
                    "meta_description",
                    row_a.meta_description.clone(),
                    row_b.meta_description.clone(),
                ),
                ("h1", row_a.h1.clone(), row_b.h1.clone()),
                (
                    "word_count",
                    row_a.word_count.to_string(),
                    row_b.word_count.to_string(),
                ),
                (
                    "canonical",
                    row_a.canonical.clone(),
                    row_b.canonical.clone(),
                ),
                (
                    "indexable",
                    row_a.indexable.to_string(),
                    row_b.indexable.to_string(),
                ),
                (
                    "content_hash",
                    row_a.content_hash.clone(),
                    row_b.content_hash.clone(),
                ),
            ];
            for (field, old_val, new_val) in fields {
                if old_val != new_val {
                    changed.push(UrlDiff {
                        url: url.clone(),
                        field: field.to_string(),
                        old_value: old_val,
                        new_value: new_val,
                    });
                }
            }
        }
    }

    Ok(CrawlComparison {
        added_urls,
        removed_urls,
        changed,
    })
}

pub fn get_storage_stats(config: &StorageConfig) -> StorageStats {
    let snapshots = list_snapshots_with_config(config);
    let dir = get_snapshots_dir_with_config(config);

    let mut total_size: u64 = 0;
    let mut domain_map: HashMap<String, (u32, String, u64)> = HashMap::new();

    for snap in &snapshots {
        let file_path = dir.join(format!("{}.json", snap.id));
        let file_size = std::fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(snap.size_bytes);
        total_size += file_size;

        let entry =
            domain_map
                .entry(snap.domain.clone())
                .or_insert((0, snap.created_at.clone(), 0));
        entry.0 += 1;
        if snap.created_at > entry.1 {
            entry.1 = snap.created_at.clone();
        }
        entry.2 += file_size;
    }

    let domains: Vec<DomainStats> = domain_map
        .into_iter()
        .map(|(domain, (count, latest, size))| DomainStats {
            domain,
            snapshot_count: count,
            latest_crawl: latest,
            total_size_bytes: size,
        })
        .collect();

    let oldest = snapshots
        .first()
        .map(|s| s.created_at.clone())
        .unwrap_or_default();
    let newest = snapshots
        .last()
        .map(|s| s.created_at.clone())
        .unwrap_or_default();

    StorageStats {
        total_snapshots: snapshots.len() as u32,
        total_size_bytes: total_size,
        storage_path: dir.to_string_lossy().to_string(),
        oldest_snapshot: oldest,
        newest_snapshot: newest,
        domains,
    }
}

fn enforce_retention(dir: &std::path::Path, config: &StorageConfig) {
    let index_path = dir.join("index.json");
    if !index_path.exists() {
        return;
    }

    let data = match std::fs::read_to_string(&index_path) {
        Ok(d) => d,
        Err(_) => return,
    };
    let mut index: Vec<SnapshotMeta> = serde_json::from_str(&data).unwrap_or_default();
    let original_len = index.len();

    // Remove expired snapshots (retention_days > 0)
    if config.retention_days > 0 {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(config.retention_days as i64);
        let cutoff_str = cutoff.to_rfc3339();
        let expired: Vec<String> = index
            .iter()
            .filter(|s| s.created_at < cutoff_str)
            .map(|s| s.id.clone())
            .collect();
        for id in &expired {
            let path = dir.join(format!("{}.json", id));
            let _ = std::fs::remove_file(path);
        }
        index.retain(|s| s.created_at >= cutoff_str);
    }

    // Remove oldest snapshots if max_snapshots exceeded
    if config.max_snapshots > 0 && index.len() > config.max_snapshots as usize {
        // Sort by date ascending (oldest first)
        index.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        let to_remove = index.len() - config.max_snapshots as usize;
        for snap in index.drain(..to_remove) {
            let path = dir.join(format!("{}.json", snap.id));
            let _ = std::fs::remove_file(path);
        }
    }

    if index.len() != original_len {
        let _ = std::fs::write(
            &index_path,
            serde_json::to_string_pretty(&index).unwrap_or_default(),
        );
    }
}

pub fn cleanup_snapshots(config: &StorageConfig) -> u32 {
    let dir = get_snapshots_dir_with_config(config);
    let index_path = dir.join("index.json");
    if !index_path.exists() {
        return 0;
    }

    let data = match std::fs::read_to_string(&index_path) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    let index: Vec<SnapshotMeta> = serde_json::from_str(&data).unwrap_or_default();
    let before = index.len() as u32;
    enforce_retention(&dir, config);
    let after = list_snapshots_with_config(config).len() as u32;
    before.saturating_sub(after)
}
