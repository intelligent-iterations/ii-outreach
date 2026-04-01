from src.reddit.search import get_search_targets


def test_get_search_targets_defaults_to_comment_mode():
    targets = get_search_targets({}, target_fresh=10)
    assert targets == {"search_type": "comment", "posts": 0, "comments": 10}


def test_get_search_targets_supports_mixed_mode():
    config = {"search": {"search_type": "mixed", "post_ratio": 0.5}}
    targets = get_search_targets(config, target_fresh=10)
    assert targets == {"search_type": "mixed", "posts": 5, "comments": 5}


def test_get_search_targets_clamps_invalid_ratio():
    config = {"search": {"search_type": "mixed", "post_ratio": 3}}
    targets = get_search_targets(config, target_fresh=8)
    assert targets == {"search_type": "mixed", "posts": 8, "comments": 0}


def test_get_search_targets_supports_post_only_mode():
    config = {"search": {"search_type": "post"}}
    targets = get_search_targets(config, target_fresh=6)
    assert targets == {"search_type": "post", "posts": 6, "comments": 0}
