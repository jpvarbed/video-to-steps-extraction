#!/usr/bin/env python3
"""Test if we can load Instagram reels with Playwright"""

import asyncio
from playwright.async_api import async_playwright
import base64

async def test_instagram_reel(url: str):
    print(f"Testing: {url}")

    async with async_playwright() as p:
        # Try with headless=False first to see what happens
        # Then we can try headless=True
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ]
        )

        context = await browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        page = await context.new_page()

        # Navigate to the reel
        print("Loading page...")
        try:
            await page.goto(url, wait_until='networkidle', timeout=30000)
        except Exception as e:
            print(f"Navigation warning: {e}")

        # Wait a bit for dynamic content
        await asyncio.sleep(3)

        # Take a screenshot to see what we got
        screenshot = await page.screenshot(path='test_screenshot.png')
        print("Screenshot saved to test_screenshot.png")

        # Check for login wall or other blocks
        content = await page.content()

        if 'Login' in content and 'Sign Up' in content:
            print("⚠️  Login wall detected - Instagram wants authentication")

        # Try to find video element
        video = await page.query_selector('video')
        if video:
            print("✅ Video element found!")

            # Try to get video dimensions
            dimensions = await page.evaluate('''() => {
                const v = document.querySelector('video');
                if (v) {
                    return {
                        width: v.videoWidth,
                        height: v.videoHeight,
                        duration: v.duration,
                        src: v.src
                    };
                }
                return null;
            }''')
            print(f"Video info: {dimensions}")

            # Try to capture a frame
            try:
                frame_data = await page.evaluate('''() => {
                    const video = document.querySelector('video');
                    if (!video || video.videoWidth === 0) return null;

                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    return canvas.toDataURL('image/jpeg', 0.8);
                }''')

                if frame_data:
                    print("✅ Frame capture successful!")
                    # Save frame
                    img_data = frame_data.split(',')[1]
                    with open('test_frame.jpg', 'wb') as f:
                        f.write(base64.b64decode(img_data))
                    print("Frame saved to test_frame.jpg")
                else:
                    print("❌ Frame capture failed - video may not be loaded")
            except Exception as e:
                print(f"❌ Frame capture error: {e}")
        else:
            print("❌ No video element found")

            # Check what's on the page
            title = await page.title()
            print(f"Page title: {title}")

        await browser.close()

if __name__ == '__main__':
    # Test with the reel URL
    url = "https://www.instagram.com/reel/DSVxVf2ktqI/"
    asyncio.run(test_instagram_reel(url))
