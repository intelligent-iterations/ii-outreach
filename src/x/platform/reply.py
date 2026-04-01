import asyncio
import re

from src.x.shared.utils import log, human_type, random_delay, take_error_screenshot
from src.x.platform.auth import nuclear_tab_reset
from src.x.runtime.state import (
    has_replied_to_tweet, has_engaged_user, record_reply, record_quote,
    ActionResult
)


def _extract_tweet_id(url: str) -> str:
    """Extract tweet ID from URL."""
    match = re.search(r'/status/(\d+)', url)
    return match.group(1) if match else ""


def _extract_username(url: str) -> str:
    """Extract username from tweet URL."""
    match = re.search(r'x\.com/([^/]+)/status', url)
    return match.group(1) if match else ""


async def reply_to_tweet(browser, page, tweet_url, reply_text, config, skip_checks=False):
    """Reply to a specific tweet.

    Args:
        browser: The zendriver browser instance
        page: Current page
        tweet_url: URL of the tweet to reply to
        reply_text: The reply text to post
        config: Config dict with delays etc.
        skip_checks: Skip duplicate checks (for testing)

    Returns:
        (success: bool, new_page: page instance)
    """
    tweet_id = _extract_tweet_id(tweet_url)
    target_user = _extract_username(tweet_url)

    # Check if we've already replied to this tweet
    if not skip_checks and has_replied_to_tweet(tweet_id):
        log.warning(f"Already replied to tweet {tweet_id}, skipping")
        record_reply(
            tweet_id=tweet_id,
            tweet_url=tweet_url,
            target_user=target_user,
            reply_text=reply_text,
            result=ActionResult.SKIPPED,
            error="Already replied to this tweet"
        )
        return False, page

    log.step("💬", f"Replying to {tweet_url}")

    try:
        # Navigate to the tweet
        await page.get(tweet_url)
        await asyncio.sleep(config["delays"]["page_load_wait_seconds"])

        # Wait for tweet to load
        await asyncio.sleep(1)

        # Find the reply input area
        # On X, the reply box has a placeholder like "Post your reply"
        reply_box = await _find_reply_box(page)

        if not reply_box:
            log.error("Could not find reply box")
            record_reply(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                reply_text=reply_text, result=ActionResult.FAILED,
                error="Could not find reply box"
            )
            await take_error_screenshot(page, "reply_no_box")
            page = await nuclear_tab_reset(browser, page)
            return False, page

        # Click to activate the reply box
        await reply_box.click()
        await random_delay(0.5, 1.0)

        # Find the actual text input area (contenteditable div)
        editor = await _find_reply_editor(page)

        if not editor:
            log.error("Could not find reply editor")
            record_reply(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                reply_text=reply_text, result=ActionResult.FAILED,
                error="Could not find reply editor"
            )
            await take_error_screenshot(page, "reply_no_editor")
            page = await nuclear_tab_reset(browser, page)
            return False, page

        # Type the reply with human-like timing
        await human_type(editor, reply_text, config)
        log.info(f"Typed reply: {reply_text[:50]}...")

        await random_delay(0.5, 1.5)

        # Find and click the Reply/Post button
        post_btn = await _find_post_button(page)

        if not post_btn:
            log.error("Could not find post button")
            record_reply(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                reply_text=reply_text, result=ActionResult.FAILED,
                error="Could not find post button"
            )
            await take_error_screenshot(page, "reply_no_button")
            page = await nuclear_tab_reset(browser, page)
            return False, page

        await post_btn.click()
        log.info("Clicked Reply button")

        # Wait for reply to post
        await asyncio.sleep(3)

        # Verify reply was posted
        success = await _verify_reply_posted(page, reply_text)

        if success:
            log.success(f"Reply posted successfully!")
            # Record successful reply
            record_reply(
                tweet_id=tweet_id,
                tweet_url=tweet_url,
                target_user=target_user,
                reply_text=reply_text,
                result=ActionResult.SUCCESS,
            )
        else:
            log.warning("Reply may have been posted - could not verify")
            # Still record as success since we clicked the button
            record_reply(
                tweet_id=tweet_id,
                tweet_url=tweet_url,
                target_user=target_user,
                reply_text=reply_text,
                result=ActionResult.SUCCESS,
                error="Could not verify post"
            )

        # Nuclear tab reset to clear any overlays/state
        page = await nuclear_tab_reset(browser, page)

        return success, page

    except Exception as e:
        log.error(f"Reply failed: {e}")
        # Record failed reply
        record_reply(
            tweet_id=tweet_id,
            tweet_url=tweet_url,
            target_user=target_user,
            reply_text=reply_text,
            result=ActionResult.FAILED,
            error=str(e)
        )
        await take_error_screenshot(page, "reply_error")
        page = await nuclear_tab_reset(browser, page)
        return False, page


async def _find_reply_box(page):
    """Find the reply input area on a tweet page."""
    # Try multiple selectors that X uses
    selectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea_0_label"]',
        '[placeholder*="reply" i]',
        '[placeholder*="Post your reply" i]',
        '[aria-label*="reply" i]',
    ]

    for selector in selectors:
        try:
            element = await page.select(selector, timeout=3)
            if element:
                return element
        except Exception:
            continue

    # Try finding by text
    try:
        element = await page.find("Post your reply", best_match=True, timeout=3)
        if element:
            return element
    except Exception:
        pass

    return None


async def _find_reply_editor(page):
    """Find the contenteditable div for typing the reply."""
    selectors = [
        '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][data-offset-key]',
        '.public-DraftEditor-content',
    ]

    for selector in selectors:
        try:
            element = await page.select(selector, timeout=3)
            if element:
                return element
        except Exception:
            continue

    return None


async def _find_post_button(page):
    """Find the Reply/Post button."""
    # The reply button has data-testid="tweetButtonInline" or similar
    selectors = [
        '[data-testid="tweetButtonInline"]',
        '[data-testid="tweetButton"]',
    ]

    for selector in selectors:
        try:
            element = await page.select(selector, timeout=3)
            if element:
                return element
        except Exception:
            continue

    # Try finding by text
    try:
        element = await page.find("Reply", best_match=True, timeout=3)
        if element:
            # Make sure it's a button, not just text
            tag = await element.evaluate("(el) => el.tagName")
            if tag and tag.lower() in ["button", "div"]:
                return element
    except Exception:
        pass

    return None


async def _verify_reply_posted(page, reply_text):
    """Verify that the reply was actually posted."""
    try:
        # Check if our reply text appears on the page
        html = await page.get_content()
        # Use first 30 chars of reply for matching
        snippet = reply_text[:30].lower()
        if snippet in html.lower():
            return True

        # Check for success indicators
        # After posting, X usually shows the reply in the thread
        await asyncio.sleep(2)
        html = await page.get_content()
        if snippet in html.lower():
            return True

    except Exception:
        pass

    return False


async def quote_tweet(browser, page, tweet_url, quote_text, config):
    """Quote tweet (retweet with comment).

    Args:
        browser: The zendriver browser instance
        page: Current page
        tweet_url: URL of the tweet to quote
        quote_text: The quote text to add
        config: Config dict with delays etc.

    Returns:
        (success: bool, new_page: page instance)
    """
    tweet_id = _extract_tweet_id(tweet_url)
    target_user = _extract_username(tweet_url)

    log.step("🔁", f"Quote tweeting {tweet_url}")

    try:
        await page.get(tweet_url)
        await asyncio.sleep(config["delays"]["page_load_wait_seconds"])

        # Find the retweet button
        retweet_btn = await page.select('[data-testid="retweet"]', timeout=10)
        if not retweet_btn:
            log.error("Could not find retweet button")
            record_quote(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                quote_text=quote_text, result=ActionResult.FAILED,
                error="Could not find retweet button"
            )
            page = await nuclear_tab_reset(browser, page)
            return False, page

        await retweet_btn.click()
        await random_delay(0.5, 1.0)

        # Click "Quote" option from the menu
        quote_option = await page.find("Quote", best_match=True, timeout=5)
        if not quote_option:
            log.error("Could not find Quote option")
            record_quote(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                quote_text=quote_text, result=ActionResult.FAILED,
                error="Could not find Quote option"
            )
            page = await nuclear_tab_reset(browser, page)
            return False, page

        await quote_option.click()
        await asyncio.sleep(2)

        # Find and fill the quote text area
        editor = await page.select('[role="textbox"][contenteditable="true"]', timeout=5)
        if not editor:
            log.error("Could not find quote editor")
            record_quote(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                quote_text=quote_text, result=ActionResult.FAILED,
                error="Could not find quote editor"
            )
            page = await nuclear_tab_reset(browser, page)
            return False, page

        await human_type(editor, quote_text, config)
        log.info(f"Typed quote: {quote_text[:50]}...")

        await random_delay(0.5, 1.0)

        # Click Post button
        post_btn = await page.select('[data-testid="tweetButton"]', timeout=5)
        if not post_btn:
            log.error("Could not find post button")
            record_quote(
                tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
                quote_text=quote_text, result=ActionResult.FAILED,
                error="Could not find post button"
            )
            page = await nuclear_tab_reset(browser, page)
            return False, page

        await post_btn.click()
        await asyncio.sleep(3)

        log.success("Quote tweet posted!")
        record_quote(
            tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
            quote_text=quote_text, result=ActionResult.SUCCESS,
        )
        page = await nuclear_tab_reset(browser, page)
        return True, page

    except Exception as e:
        log.error(f"Quote tweet failed: {e}")
        record_quote(
            tweet_id=tweet_id, tweet_url=tweet_url, target_user=target_user,
            quote_text=quote_text, result=ActionResult.FAILED,
            error=str(e)
        )
        await take_error_screenshot(page, "quote_error")
        page = await nuclear_tab_reset(browser, page)
        return False, page


async def check_rate_limit(page):
    """Check if we're being rate limited by X."""
    try:
        html = await page.get_content()

        rate_limit_phrases = [
            "rate limit",
            "try again later",
            "too many requests",
            "slow down",
            "you are over the daily limit",
        ]

        html_lower = html.lower()
        for phrase in rate_limit_phrases:
            if phrase in html_lower:
                log.warning(f"Rate limit detected: '{phrase}'")
                return True

    except Exception:
        pass

    return False
