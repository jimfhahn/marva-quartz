# validate.bibframe.app API Reference

Authoritative reference for integrating against the public MCP4RDF validation service that powers the Gradio UI. All endpoints are hosted behind HTTPS at `https://validate.bibframe.app`.

> ℹ️  No authentication is currently required. Plan for future API keys if you embed this service in production software.

## Available Endpoints

| Method | Path | Purpose | Typical Latency |
|--------|------|---------|-----------------|
| `POST` | `/validate` | Validate RDF/XML against BIBFRAME templates (optionally auto-fix) | 8&ndash;25 s with AI enabled |
| `POST` | `/ai-correct` | Call the AI corrector directly with SHACL results | 6&ndash;20 s |
| `POST` | `/summarize_warnings` | Summarise SHACL warnings in plain English (no fixes) | < 5 s |
| `GET`  | `/health` | Basic service health probe | < 1 s |

The controller orchestrates validation and AI correction, so `/validate` is the recommended entry point for most integrations.

---

## 1. `POST /validate`

Validate BIBFRAME RDF/XML against one of the supported templates. Optionally let the AI corrector repair the graph when validation fails.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rdf` | string | ✅ | RDF/XML payload to validate. Turtle is accepted but RDF/XML is preferred. |
| `template` | string | ✅ | Template identifier. See [Supported templates](#supported-templates). |
| `auto_fix` | boolean | optional | When `true`, invokes the AI corrector if validation reports violations. Defaults to `true` in the hosted UI. |

**Example**

```bash
curl -X POST https://validate.bibframe.app/validate \
  -H 'Content-Type: application/json' \
  -d '{
    "rdf": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"\n         xmlns:bf=\"http://id.loc.gov/ontologies/bibframe/\">\n  <bf:Work rdf:about=\"http://example.org/work1\">\n    <rdf:type rdf:resource=\"http://id.loc.gov/ontologies/bibframe/Text\"/>\n    <bf:title>Example Title</bf:title>\n  </bf:Work>\n</rdf:RDF>\n",
    "template": "Monograph_Work_Text",
    "auto_fix": true
  }'
```

**Success response** (`200 OK`)

```json
{
  "status": "fixed",
  "method": "ai_validation_based_correction",
  "quality_score": 84,
  "data": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "validation": {
    "conforms": true,
    "results_count": 0,
    "results": []
  },
  "metadata": {
    "ai_explanation": "Corrected bf:adminMetadata to use bf:assigner instead of bf:agent.",
    "tokens_used": 3125,
    "used_bibframe_context": true,
    "used_loc_examples": true
  },
  "validation_proof": {
    "before_correction": {
      "violation_count": 3,
      "triple_count": 14
    },
    "after_correction": {
      "violation_count": 0,
      "triple_count": 17
    },
    "improvement": {
      "violations_fixed": 3,
      "improvement_percentage": 100
    }
  },
  "processing_time_ms": 19264
}
```

**Common error responses**

| Status | Body | Meaning |
|--------|------|---------|
| `400 Bad Request` | `{ "error": "Missing field rdf" }` | Required field missing or malformed JSON |
| `422 Unprocessable Entity` | `{ "error": "Failed to parse RDF/XML" }` | RDF could not be parsed |
| `504 Gateway Timeout` | `{ "error": "AI correction timed out" }` | AI corrector exceeded the time limit |

---

## 2. `POST /ai-correct`

Call the AI corrector service directly. Useful when you already have SHACL validation output and only need to generate a corrected RDF graph and explanation.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rdf` | string | ✅ | Original RDF/XML that requires correction |
| `validation_results` | string/array | recommended | SHACL validation report (string or array). Enables targeted prompts and LoC example retrieval |
| `template` | string | optional | Template hint for prompt context (e.g., `Monograph_Work_Text`) |
| `strategy` | string | optional | Force correction strategy: `"node-by-node"` or `"chunked"` |

**Response**

```json
{
  "fixed_rdf": "<?xml version=\"1.0\"?>...",
  "explanation": "Added bf:assigner resource with bf:Agent to satisfy template requirements.",
  "explanation_source": "validation_based",
  "used_bibframe_context": true,
  "used_loc_examples": true,
  "tokens_used": 2876,
  "chunked": false
}
```

A `500` response indicates the AI output could not be parsed as RDF/XML. The body contains the parsing error message and the original RDF is returned unchanged.

---

## 3. `POST /summarize_warnings`

Generate a human-readable summary when SHACL validation returns warnings but no violations. This endpoint does **not** modify RDF.

```json
{
  "validation_results": {...},
  "context": "Optional additional context for the summary"
}
```

Response:

```json
{
  "summary": "⚠️ Found 2 warnings. The RDF is valid but consider adding bf:note for clarity.",
  "warning_count": 2,
  "context": "Optional context echoed back"
}
```

---

## 4. `GET /health`

Lightweight readiness/liveness probe. Returns `200 OK` when the controller and downstream services are available.

```bash
curl https://validate.bibframe.app/health
```

**Response**

```json
{
  "status": "ok",
  "ai_circuit_breaker_state": "closed",
  "validator_circuit_breaker_state": "closed"
}
```

---

## Supported Templates

The hosted service currently accepts the following template identifiers:

- `Monograph_Work_Text`
- `Monograph_AdminMetadata`
- `Monograph_Instance_Print`
- `Monograph_Instance_Electronic`

Additional templates can be onboarded; contact the maintainers if you need more coverage.

---

## Usage Guidelines & Limits

- **Timeouts**: Client timeout of 60&ndash;90 seconds is recommended when `auto_fix` is enabled.
- **Payload size**: Practical upper limit is ~200 KB of RDF/XML. Larger graphs should be chunked before submission.
- **Rate limiting**: None enforced today. If you build an app, add exponential backoff and jitter around retry logic.
- **Namespaces**: The controller auto-adds common BIBFRAME namespaces when missing.
- **Explanations**: Corrected RDF is only returned when an AI explanation is available, ensuring transparent changes.

---

## Quick Integration Examples

### JavaScript (Fetch)

```javascript
const payload = {
  rdf: rdfXmlString,
  template: "Monograph_Work_Text",
  auto_fix: true
};

fetch("https://validate.bibframe.app/validate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
  .then((res) => res.json())
  .then((data) => {
    if (data.status === "fixed" || data.status === "valid") {
      console.log("Corrected RDF:", data.data || data.corrected_rdf);
      console.log("Explanation:", data.metadata?.ai_explanation);
    } else {
      console.error("Validation failed:", data.error);
    }
  });
```

### Python (requests)

```python
import requests

payload = {
    "rdf": rdf_xml,
    "template": "Monograph_Work_Text",
    "auto_fix": True
}

response = requests.post(
    "https://validate.bibframe.app/validate",
    json=payload,
    timeout=90
)
response.raise_for_status()
result = response.json()

if result["status"] in {"valid", "fixed", "partially_fixed"}:
    corrected = result.get("data") or result.get("corrected_rdf")
    explanation = result.get("metadata", {}).get("ai_explanation")
    print("RDF now valid:", corrected)
    print("AI explanation:", explanation)
else:
    print("Validation error:", result.get("error"))
```

---

## Change Log

| Date | Update |
|------|--------|
| 2025-10-17 | Initial publication for hosted API |

---

Need something not covered here? Open an issue or contact the MCP4RDF maintainers.
