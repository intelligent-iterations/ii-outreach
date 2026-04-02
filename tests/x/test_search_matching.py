import unittest

from src.x.platform.search import _keyword_matches_text


class SearchKeywordMatchingTests(unittest.TestCase):
    def test_exact_phrase_still_matches(self):
        self.assertTrue(_keyword_matches_text("reddit outreach", "Need a better reddit outreach workflow"))

    def test_multiword_keyword_matches_when_tokens_are_separated(self):
        text = "Someone should build an alternative to GummySearch for Reddit monitoring."
        self.assertTrue(_keyword_matches_text("gummysearch alternative", text))

    def test_single_word_keyword_requires_token_presence(self):
        self.assertTrue(_keyword_matches_text("gummysearch", "GummySearch is shutting down"))
        self.assertFalse(_keyword_matches_text("gummysearch", "Need a better community research tool"))


if __name__ == "__main__":
    unittest.main()
