# AI service

The functioning assistant is retrieval-first and extractive. Express detects an intent and retrieves only verified current location facts; the historical overview explicitly identifies its limitations. Directions and nearest-facility requests direct users to deterministic routing/spatial tools. No LLM invents coordinates, opening hours or campus advice.

An optional FastAPI service preserves the retrieved answer and source list behind an `ExtractiveProvider` interface. Run `python -m pip install -r ai-service/requirements.txt`, then `python -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8000`. Set `AI_SERVICE_URL=http://127.0.0.1:8000` for the API to use it. Failed requests fall back to local deterministic retrieval.

There is no configured generative model or embedding index. This is a working retrieval layer and provider boundary, not a claim of a deployed LLM RAG system. Before adding a model, require source-constrained output validation and adversarial tests. The browser never receives provider secrets. Keep the Python service private; it processes the retrieval supplied by the API, not arbitrary requests claiming to be official campus evidence. The local service has been started and its health endpoint verified on port 8000.
