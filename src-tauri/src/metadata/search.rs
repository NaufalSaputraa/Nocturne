use std::collections::HashSet;
use async_trait::async_trait;
use rustypipe::client::RustyPipe;
use rustypipe::model::{AlbumItem, ArtistItem, MusicItem, TrackItem};

use crate::models::{AlbumSummary, AppError, ArtistSummary, SearchResult, TopResultItem, TrackMetadata};

/// Abstraction over YouTube Music catalog search, charts, artist tracks, and Auto-Radio.
#[async_trait]
pub trait CatalogProvider: Send + Sync {
    async fn search_catalog(&self, query: &str) -> Result<SearchResult, AppError>;
    async fn get_home_feed(&self) -> Result<Vec<TrackMetadata>, AppError>;
    async fn get_artist_tracks(&self, artist_id: &str) -> Result<Vec<TrackMetadata>, AppError>;
    async fn get_auto_radio(
        &self,
        seed_video_id: &str,
        exclude_ids: &HashSet<String>,
    ) -> Result<Vec<TrackMetadata>, AppError>;
}

/// Filters out tracks whose `video_id` is already queued, played, or duplicated in `candidates`.
pub fn deduplicate_radio_tracks(
    candidates: Vec<TrackMetadata>,
    exclude_ids: &HashSet<String>,
) -> Vec<TrackMetadata> {
    let mut seen = exclude_ids.clone();
    let mut unique = Vec::new();
    for track in candidates {
        if seen.insert(track.video_id.clone()) {
            unique.push(track);
        }
    }
    unique
}

fn best_thumb(thumbs: &[rustypipe::model::Thumbnail]) -> String {
    thumbs
        .iter()
        .max_by_key(|t| t.width)
        .map(|t| t.url.clone())
        .unwrap_or_default()
}

fn map_track(item: &TrackItem) -> TrackMetadata {
    let artist = item
        .artists
        .iter()
        .map(|a| a.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    TrackMetadata {
        video_id: item.id.clone(),
        title: item.name.clone(),
        artist: if artist.is_empty() {
            "Unknown Artist".to_string()
        } else {
            artist
        },
        album: item.album.as_ref().map(|a| a.name.clone()),
        duration_sec: item.duration.unwrap_or(0) as u64,
        thumbnail_url: best_thumb(&item.cover),
    }
}

fn map_album(item: &AlbumItem) -> AlbumSummary {
    let artist = item
        .artists
        .iter()
        .map(|a| a.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    AlbumSummary {
        id: item.id.clone(),
        title: item.name.clone(),
        artist,
        year: item.year.map(|y| y as u32),
        thumbnail_url: best_thumb(&item.cover),
    }
}

fn map_artist(item: &ArtistItem) -> ArtistSummary {
    ArtistSummary {
        id: item.id.clone(),
        name: item.name.clone(),
        subscribers: item.subscriber_count.map(|c| format!("{c}")),
        thumbnail_url: best_thumb(&item.avatar),
    }
}

/// Pure-Rust YouTube Music catalog provider powered by `rustypipe`.
#[derive(Clone)]
pub struct RustypipeCatalogProvider {
    client: RustyPipe,
}

impl RustypipeCatalogProvider {
    pub fn new() -> Self {
        Self {
            client: RustyPipe::new(),
        }
    }

    pub fn with_client(client: RustyPipe) -> Self {
        Self { client }
    }
}

impl Default for RustypipeCatalogProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CatalogProvider for RustypipeCatalogProvider {
    async fn search_catalog(&self, query: &str) -> Result<SearchResult, AppError> {
        let res = self
            .client
            .query()
            .music_search_main(query)
            .await
            .map_err(|e| AppError::Extraction(format!("music_search_main failed: {e}")))?;

        let mut out = SearchResult::default();
        for item in res.items.items {
            match item {
                MusicItem::Track(t) => {
                    let mapped = map_track(&t);
                    if out.top_result.is_none() {
                        out.top_result = Some(TopResultItem {
                            id: mapped.video_id.clone(),
                            kind: "song".to_string(),
                            title: mapped.title.clone(),
                            subtitle: mapped.artist.clone(),
                            thumbnail_url: mapped.thumbnail_url.clone(),
                            track: Some(mapped.clone()),
                        });
                    }
                    out.songs.push(mapped);
                }
                MusicItem::Album(a) => {
                    let mapped = map_album(&a);
                    if out.top_result.is_none() {
                        out.top_result = Some(TopResultItem {
                            id: mapped.id.clone(),
                            kind: "album".to_string(),
                            title: mapped.title.clone(),
                            subtitle: mapped.artist.clone(),
                            thumbnail_url: mapped.thumbnail_url.clone(),
                            track: None,
                        });
                    }
                    out.albums.push(mapped);
                }
                MusicItem::Artist(ar) => {
                    let mapped = map_artist(&ar);
                    if out.top_result.is_none() {
                        out.top_result = Some(TopResultItem {
                            id: mapped.id.clone(),
                            kind: "artist".to_string(),
                            title: mapped.name.clone(),
                            subtitle: mapped.subscribers.clone().unwrap_or_else(|| "Artist".to_string()),
                            thumbnail_url: mapped.thumbnail_url.clone(),
                            track: None,
                        });
                    }
                    out.artists.push(mapped);
                }
                _ => {}
            }
        }
        Ok(out)
    }

    async fn get_home_feed(&self) -> Result<Vec<TrackMetadata>, AppError> {
        let charts = self
            .client
            .query()
            .music_charts(None)
            .await
            .map_err(|e| AppError::Extraction(format!("music_charts failed: {e}")))?;

        let mut tracks: Vec<TrackMetadata> = charts.top_tracks.iter().map(map_track).collect();
        for t in &charts.trending_tracks {
            if !tracks.iter().any(|existing| existing.video_id == t.id) {
                tracks.push(map_track(t));
            }
        }
        Ok(tracks)
    }

    async fn get_artist_tracks(&self, artist_id: &str) -> Result<Vec<TrackMetadata>, AppError> {
        let artist = self
            .client
            .query()
            .music_artist(artist_id, false)
            .await
            .map_err(|e| AppError::Extraction(format!("music_artist failed: {e}")))?;
        Ok(artist.tracks.iter().map(map_track).collect())
    }

    async fn get_auto_radio(
        &self,
        seed_video_id: &str,
        exclude_ids: &HashSet<String>,
    ) -> Result<Vec<TrackMetadata>, AppError> {
        let radio = self
            .client
            .query()
            .music_radio_track(seed_video_id)
            .await
            .map_err(|e| AppError::Extraction(format!("music_radio_track failed: {e}")))?;
        let mapped: Vec<TrackMetadata> = radio.items.iter().map(map_track).collect();
        Ok(deduplicate_radio_tracks(mapped, exclude_ids))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: &str) -> TrackMetadata {
        TrackMetadata {
            video_id: id.to_string(),
            title: format!("Title {id}"),
            artist: "Artist".to_string(),
            album: None,
            duration_sec: 180,
            thumbnail_url: String::new(),
        }
    }

    #[test]
    fn auto_radio_excludes_already_queued_or_played_video_ids() {
        let existing: HashSet<String> = ["v1", "v2"].iter().map(|s| s.to_string()).collect();
        let candidates = vec![
            track("v1"),
            track("v3"),
            track("v2"),
            track("v3"),
            track("v4"),
        ];

        let filtered = deduplicate_radio_tracks(candidates, &existing);
        let ids: Vec<&str> = filtered.iter().map(|t| t.video_id.as_str()).collect();
        assert_eq!(ids, vec!["v3", "v4"]);
    }
}
