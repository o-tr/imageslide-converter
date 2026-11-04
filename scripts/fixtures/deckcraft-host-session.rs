use deckcraft_engine::Session;
use serde_json::json;

// HOST_SESSION_HELPER


#[test]
fn host_reuse_keeps_the_latest_document_and_discards_old_documents() {
    let mut session = Session::new();
    for _ in 0..3 { session.execute("file.new", &json!({})).unwrap(); }
    let expected = session.active().unwrap().title().to_string();
    assert_eq!(session.documents().len(), 3);
    retain_latest_document(&mut session);
    assert_eq!(session.documents().len(), 1);
    assert_eq!(session.active().unwrap().title(), expected);
}

#[test]
fn failed_import_cleanup_preserves_the_previous_document() {
    let mut session = Session::new();
    session.execute("file.new", &json!({})).unwrap();
    let expected = session.active().unwrap().title().to_string();
    let previous = session.documents().len();
    session.execute("file.new", &json!({})).unwrap();
    while session.documents().len() > previous {
        let last = session.documents().len() - 1;
        session.close_document(last);
    }
    assert_eq!(session.documents().len(), 1);
    assert_eq!(session.active().unwrap().title(), expected);
}

#[test]
fn host_can_open_a_fresh_pptx_then_discard_the_old_document() {
    let mut session = Session::new();
    session.execute("file.new", &json!({})).unwrap();
    let saved = session.execute("file.saveBytes", &json!({"format": "pptx"})).unwrap();
    let original = session.active().unwrap().title().to_string();
    session.execute("file.openBytes", &json!({"name": "next.pptx", "data": saved["data"]})).unwrap();
    assert_eq!(session.documents().len(), 2);
    assert_ne!(session.active().unwrap().title(), original);
    let expected = session.active().unwrap().title().to_string();
    retain_latest_document(&mut session);
    assert_eq!(session.documents().len(), 1);
    assert_eq!(session.active().unwrap().title(), expected);
    assert!(!session.active().unwrap().doc.slides.is_empty());
}
