// Adapt the vendored web shell in the temporary build tree for an in-page host.
import { readFile, writeFile } from "node:fs/promises";
const path = process.argv[2];
let source = await readFile(path, "utf8");
function replace(before, after) {
  if (!source.includes(before))
    throw new Error(`DeckCraft web shell changed: ${before}`);
  source = source.replaceAll(before, after);
}
replace(
  'const CANVAS_ID: &str = "deckcraft_canvas";\nconst LOADING_ID: &str = "deckcraft_loading";',
  `const CANVAS_ID: &str = "deckcraft_canvas";
fn host_element(name: &str) -> Option<web_sys::Element> {
    let window = web_sys::window()?;
    let value = js_sys::Reflect::get(&JsValue::from(window.clone()), &JsValue::from_str(name)).ok();
    value.and_then(|v| v.dyn_into().ok()).or_else(|| {
        window.document()?.get_element_by_id(if name == "imageSlideCanvas" { "deckcraft_canvas" } else { "deckcraft_loading" })
    })
}`,
);
replace(
  "document.get_element_by_id(LOADING_ID)",
  'host_element("imageSlideLoading")',
);
replace(
  "document.get_element_by_id(CANVAS_ID)",
  'host_element("imageSlideCanvas")',
);
replace(
  "let Some(document) = web_sys::window().and_then(|w| w.document()) else {",
  "let Some(_document) = web_sys::window().and_then(|w| w.document()) else {",
);
replace(
  "fn query() -> String {\n    web_sys::window().and_then(|w| w.location().search().ok()).unwrap_or_default()\n}",
  'fn query() -> String { if host_element("imageSlideCanvas").is_some() && js_sys::Reflect::has(&JsValue::from(web_sys::window().unwrap()), &JsValue::from_str("imageSlideCanvas")).unwrap_or(false) { "?blank".into() } else { web_sys::window().and_then(|w| w.location().search().ok()).unwrap_or_default() } }',
);
replace(
  "web_sys::window().is_some_and(|w| w.parent().ok().flatten().is_some_and(|p| !js_sys::Object::is(&w, &p)))",
  'bridge_function("imageSlideHostMarker").is_some() || web_sys::window().is_some_and(|w| w.parent().ok().flatten().is_some_and(|p| !js_sys::Object::is(&w, &p)))',
);
replace(
  'let result = import_images(&mut self.app, &field("slides"));',
  'let previous = self.app.session.documents().len(); let result = self.app.run("file.new", serde_json::json!({})).map_err(|e| e.to_string()).and_then(|_| import_images(&mut self.app, &field("slides"))); if result.is_err() { while self.app.session.documents().len() > previous { let last = self.app.session.documents().len() - 1; self.app.session.close_document(last); } }',
);
replace(
  "/// Set the presentation's unspecified default language without rewriting existing runs.",
  `/// Keep the newly opened presentation and release previous host sessions.
fn retain_latest_document(session: &mut Session) {
    while session.documents().len() > 1 { session.close_document(0); }
}

/// Set the presentation's unspecified default language without rewriting existing runs.`,
);
replace(
  'Ok(_) => { set_default_japanese(&mut self.app.session); self.app.services.host_ready = true; bridge_send("opened", "", JsValue::NULL); },',
  'Ok(_) => { retain_latest_document(&mut self.app.session); set_default_japanese(&mut self.app.session); self.app.services.host_ready = true; bridge_send("opened", "", JsValue::NULL); },',
);
replace(
  'Ok(()) => { self.app.services.host_ready = true; bridge_send("opened", "", JsValue::NULL); },',
  'Ok(()) => { retain_latest_document(&mut self.app.session); self.app.services.host_ready = true; bridge_send("opened", "", JsValue::NULL); },',
);
await writeFile(path, source);
