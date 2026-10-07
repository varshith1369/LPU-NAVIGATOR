import unittest
from fastapi.testclient import TestClient
from app.main import app

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json()['provider'], 'extractive')

    def test_validated_retrieval(self):
        response = self.client.post('/answer', json={'question': 'Where?', 'retrieval': {
            'intent': 'LOCATION_SEARCH', 'answer': 'Unknown.', 'sources': []}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['answer'], 'Unknown.')

    def test_missing_retrieval_rejected(self):
        self.assertEqual(self.client.post('/answer', json={'question': 'Where?'}).status_code, 422)

if __name__ == '__main__':
    unittest.main()
