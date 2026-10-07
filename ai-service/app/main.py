from fastapi import FastAPI
from pydantic import BaseModel, Field, ConfigDict
from .grounding import ExtractiveProvider

app = FastAPI(title='LPU Campus Retrieval Service', version='1.0.0')
provider = ExtractiveProvider()

class Source(BaseModel):
    title: str = Field(max_length=500)
    url: str | None = None
    verification_status: str

class Retrieval(BaseModel):
    model_config = ConfigDict(extra='forbid')
    intent: str
    answer: str = Field(max_length=20000)
    sources: list[Source] = Field(default_factory=list, max_length=20)

class Question(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    retrieval: Retrieval

@app.get('/health')
def health():
    return {'status': 'ok', 'provider': 'extractive', 'model_configured': False}

@app.post('/answer')
def answer(body: Question):
    return provider.answer(body.question, body.retrieval.model_dump())
