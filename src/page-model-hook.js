"use strict";

var MODEL_FIELD_RE = /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/i;
var MODEL_RE = /^[a-z][a-z0-9._-]{1,95}$/i;
var CHATGPT_MODE_SLUG_RE = /^gpt-(?:(?:\d+(?:[-_.]\d+)*)|4o|4\.5|4\.1|4|3\.5)[-_.](thinking|instant|fast|auto|pro)$/i;
var CHATGPT_INTERNAL_FAMILY_RE = /^gpt-\d+-\d+(?:[-_.][a-z0-9][a-z0-9._-]*)?$/i;

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalRequestModelSlug(value) {
  // \u4fdd\u7559\u6b21\u7248\u672c\u53f7:gpt-5-5-thinking \u4e0d\u518d\u6298\u53e0\u4e3a gpt-5-thinking\u3002
  // ChatGPT \u5b9e\u9645\u540c\u65f6\u63d0\u4f9b gpt-5-3-thinking / gpt-5-4-thinking / gpt-5-5-thinking \u7b49\u4e0d\u540c\u6a21\u578b\u3002
  return normalize(value).toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
}

function featureId(value) {
  var clean = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/[-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  var versionless = clean.replace(/_v\d+$/, "");
  if (/^(gpt_image|dalle|dall_e)$/.test(clean)) return "image_generation";
  if (/^(image|images|image_generation|imagegen)$/.test(versionless)) return "image_generation";
  if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(versionless)) return "deep_research";
  if (/^(agent|agent_mode|agentmode)$/.test(versionless)) return "agent_mode";
  if (/^(web_search|websearch|search)$/.test(versionless)) return "web_search";
  if (/^(realtime|real_time|realtime_mode|real_time_mode)$/.test(versionless)) return "realtime";
  if (/^(audio|audiomode|audio_mode|voice|voicemode|voice_mode|advanced_voice|input_audio|output_audio|transcription|transcribe|tts|whisper)$/.test(versionless)) return "audio";
  if (/^(canvas|canvases|canvas_mode|canvasmode)$/.test(versionless)) return "canvas";
  return "";
}

function hasKnownModelPrefix(value) {
  if (/^image-\d+-image$/i.test(String(value || "").replace(/_/g, "-"))) {
    return false;
  }
  return /^(?:gpt|o\d+(?:-(?:mini|pro|high))?|chat|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(String(value || ""));
}

function hasGenericModelSlugEvidence(value) {
  var slug = String(value || "").toLowerCase().replace(/_/g, "-");
  if (hasKnownModelPrefix(slug)) {
    return true;
  }
  if (/(?:[-_.](?:thinking|instant|fast|auto|pro))$/i.test(slug) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(slug)) {
    return true;
  }
  if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(slug)) {
    return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(slug);
  }
  return false;
}

function isFeatureNamedSlug(value) {
  var slug = String(value || "").toLowerCase().replace(/_/g, "-");
  if (/^image-\d+-image$/i.test(slug)) {
    return true;
  }
  return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(slug) &&
    !/^(?:gpt-image|dall-e|image-\d)/i.test(slug);
}

function isModelSlug(value) {
  var text = canonicalRequestModelSlug(value);
  var normalized = text.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
  var unresolved = normalized.replace(/[^a-z0-9]+/g, "");
  // \u771f\u5b9e\u6a21\u578b slug \u5f62\u5982 gpt-5-5 / gpt-5-5-thinking / gpt-5-3-instant \u2014\u2014 \u77ed\u6a2a\u7ebf\u5e26\u6b21\u7248\u672c\u53f7,
  // \u6bcf\u4e2a\u90fd\u662f\u72ec\u7acb\u6a21\u578b\u3002\u53ea\u8981\u7ed3\u6784\u5408\u6cd5\u3001\u975e\u529f\u80fd/\u53c2\u6570\u540d\u3001\u975e\u53e5\u70b9\u5c55\u793a\u6807\u7b7e(gpt-5.x)\u5373\u89c6\u4e3a\u6a21\u578b\u3002
  return MODEL_RE.test(text) &&
    !/^(auto|default|none|null|undefined|chatgpt)$/i.test(text) &&
    !/^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(unresolved) &&
    !/^(?:gpt)?lastusedmodel$/.test(unresolved) &&
    !featureId(text) &&
    !isFeatureNamedSlug(text) &&
    !/^gpt-5\.\d+(?:$|[-_.])/.test(normalized) &&
    hasGenericModelSlugEvidence(normalized);
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    MODEL_FIELD_RE: MODEL_FIELD_RE,
    isModelSlug: isModelSlug
  };
}
