import unittest
from pathlib import Path
from training.train import check_data

class GateTests(unittest.TestCase):
    def test_empty_real_dataset_does_not_train(self):
        with self.assertRaisesRegex(ValueError, 'Training disabled'):
            check_data(Path(__file__).parent / 'data/crowd_observations.csv')

if __name__ == '__main__':
    unittest.main()
