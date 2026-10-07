"""Extractive generation boundary: unknown facts never become model completions."""
UNKNOWN = "I don't have verified information about that location yet."

class ExtractiveProvider:
    """Provider protocol can be implemented by a future citation-constrained model adapter."""
    def answer(self, question: str, retrieval: dict) -> dict:
        intent = retrieval.get('intent', 'GENERAL_HELP')
        answer = retrieval.get('answer')
        sources = retrieval.get('sources', [])
        if not isinstance(answer, str) or not answer.strip():
            return {'intent': intent, 'answer': UNKNOWN, 'sources': []}
        # No paraphrasing: preserve exact retrieved facts and qualifications.
        return {'intent': intent, 'answer': answer, 'sources': sources, 'provider': 'extractive'}
