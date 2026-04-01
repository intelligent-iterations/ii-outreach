import asyncio
import re
from datetime import datetime, timedelta
from urllib.parse import quote

from src.x.shared.utils import log, random_delay, take_error_screenshot


async def search_posts(page, keyword, config, max_results=20):
    """Search X for posts matching keyword. Returns list of post dicts.

    Each post dict contains:
    - tweet_id: The tweet's unique ID
    - username: Author's @handle
    - display_name: Author's display name
    - text: Tweet text content
    - url: Direct link to the tweet
    - timestamp: When the tweet was posted (if available)
    - likes: Like count (if available)
    - retweets: Retweet count (if available)
    - replies: Reply count (if available)
    """
    log.step("🔍", f"Searching for: '{keyword}'")

    # Build search URL - search for recent posts
    # Using X's search with filters: -filter:replies excludes replies, lang:en for English
    encoded_keyword = quote(keyword)
    search_url = f"https://x.com/search?q={encoded_keyword}&src=typed_query&f=live"

    try:
        await page.get(search_url)
        await asyncio.sleep(config["delays"]["page_load_wait_seconds"])
    except Exception as e:
        log.error(f"Failed to load search page: {e}")
        return []

    posts = []
    seen_ids = set()
    scroll_count = 0
    max_scrolls = config.get("search", {}).get("max_scrolls", 10)

    while len(posts) < max_results and scroll_count < max_scrolls:
        # Get current page HTML
        try:
            html = await page.get_content()
        except Exception as e:
            log.error(f"Failed to get page content: {e}")
            break

        # Parse tweets from HTML
        new_posts = _parse_tweets(html, keyword, seen_ids)

        for post in new_posts:
            if post["tweet_id"] not in seen_ids:
                seen_ids.add(post["tweet_id"])
                posts.append(post)

                if len(posts) >= max_results:
                    break

        if len(posts) >= max_results:
            break

        # Scroll down to load more
        scroll_count += 1
        log.step("📜", f"Scrolling... ({scroll_count}/{max_scrolls})", f"{len(posts)} posts found")

        try:
            await page.scroll_down(800)
            await random_delay(1.5, 3.0)
        except Exception as e:
            log.error(f"Scroll failed: {e}")
            break

    log.success(f"Found {len(posts)} posts for '{keyword}'")
    return posts


def _parse_tweets(html, keyword, seen_ids):
    """Parse tweets from X search results HTML."""
    posts = []

    # X wraps each tweet in an article element
    # Split by article tags to process each tweet
    tweet_blocks = re.split(r'<article[^>]*role="article"[^>]*>', html)

    for block in tweet_blocks[1:]:  # Skip first split (before any article)
        try:
            # Extract tweet ID from the status link
            # Pattern: /username/status/1234567890
            status_match = re.search(r'/([^/]+)/status/(\d+)', block)
            if not status_match:
                continue

            username = status_match.group(1)
            tweet_id = status_match.group(2)

            if tweet_id in seen_ids:
                continue

            # Extract display name - usually in a span before the @username
            display_name = username  # Default to username
            name_match = re.search(r'<span[^>]*>([^<]{1,50})</span>\s*</div>\s*<div[^>]*>\s*<span[^>]*>@' + re.escape(username), block)
            if name_match:
                display_name = _clean_html(name_match.group(1))

            # Extract tweet text
            # X puts tweet text in a div with data-testid="tweetText"
            text_match = re.search(r'data-testid="tweetText"[^>]*>(.*?)</div>', block, re.DOTALL)
            text = ""
            if text_match:
                text = _clean_html(text_match.group(1))

            if not text:
                continue

            # Extract engagement metrics
            likes = _extract_metric(block, "like")
            retweets = _extract_metric(block, "retweet")
            replies = _extract_metric(block, "reply")

            # Extract timestamp
            time_match = re.search(r'<time[^>]*datetime="([^"]+)"', block)
            timestamp = time_match.group(1) if time_match else None

            # Check if keyword is actually in the text (case insensitive)
            keyword_confirmed = keyword.lower() in text.lower()

            post = {
                "tweet_id": tweet_id,
                "username": username,
                "display_name": display_name,
                "text": text,
                "url": f"https://x.com/{username}/status/{tweet_id}",
                "timestamp": timestamp,
                "likes": likes,
                "retweets": retweets,
                "replies": replies,
                "keyword": keyword,
                "keyword_confirmed": keyword_confirmed,
            }

            posts.append(post)

        except Exception as e:
            continue

    return posts


def _clean_html(text):
    """Remove HTML tags and clean up text."""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode common HTML entities
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    text = text.replace('&nbsp;', ' ')
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _extract_metric(html_block, metric_type):
    """Extract engagement metric (likes, retweets, replies) from tweet block."""
    # X uses aria-label for accessibility, e.g., "123 Likes"
    pattern = rf'aria-label="(\d+)\s*{metric_type}'
    match = re.search(pattern, html_block, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return 0


async def search_posts_advanced(page, query, config, max_results=20, filters=None):
    """Advanced search with filters.

    filters dict can include:
    - min_likes: Minimum like count
    - min_retweets: Minimum retweet count
    - exclude_replies: bool - exclude reply tweets
    - only_verified: bool - only verified accounts
    - lang: Language code (e.g., 'en')
    - since: Date string YYYY-MM-DD
    - until: Date string YYYY-MM-DD
    """
    filters = filters or {}

    # Build advanced query
    query_parts = [query]

    if filters.get("min_likes"):
        query_parts.append(f"min_faves:{filters['min_likes']}")

    if filters.get("min_retweets"):
        query_parts.append(f"min_retweets:{filters['min_retweets']}")

    if filters.get("exclude_replies"):
        query_parts.append("-filter:replies")

    if filters.get("only_verified"):
        query_parts.append("filter:verified")

    if filters.get("lang"):
        query_parts.append(f"lang:{filters['lang']}")

    if filters.get("since"):
        query_parts.append(f"since:{filters['since']}")

    if filters.get("until"):
        query_parts.append(f"until:{filters['until']}")

    full_query = " ".join(query_parts)
    return await search_posts(page, full_query, config, max_results)


async def get_thread_context(page, tweet_url, config):
    """Navigate to a tweet and get the thread context (parent tweets)."""
    log.step("🧵", f"Getting thread context for {tweet_url}")

    try:
        await page.get(tweet_url)
        await asyncio.sleep(config["delays"]["page_load_wait_seconds"])

        html = await page.get_content()

        # Parse all tweets in the thread view
        # The main tweet and any parent tweets will be in article elements
        thread_tweets = _parse_tweets(html, "", set())

        return thread_tweets

    except Exception as e:
        log.error(f"Failed to get thread context: {e}")
        return []
