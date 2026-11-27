import asyncio
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
import json

async def main():
    params = StdioServerParameters(command="python", args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "search_public_web",
                {
                    "platform": "leetcode",
                    "query": "Google Software Engineer interview experience site:leetcode.com",
                },
            )
            page = json.loads(result.content[0].text)
            assert page["platform"] == "leetcode"
            assert page["url"].startswith("https://")
            assert "google.com/search" not in page["url"]
            assert page["excerpt"] != "Public search for interview preparation."
            assert len(page["excerpt"]) > 40
            print(page["url"])
            print(page["excerpt"])
            print("search tool ok")

asyncio.run(main())