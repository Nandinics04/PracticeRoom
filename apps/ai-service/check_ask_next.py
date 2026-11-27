import asyncio
import json
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

async def main():
    import os
    if not os.environ.get("PRACTICE_ROOM_LLM_KEY"):
        print("ask next skipped")
        return
    params = StdioServerParameters(command="python", args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "ask_next",
                {
                    "section": "Background",
                    "answer": "I designed a service and chose a cache to keep reads fast.",
                },
            )
            turn = json.loads(result.content[0].text)
            assert turn["sectionName"] == "Background"
            assert "You said" in turn["prompt"]
            hello = await session.call_tool(
                "ask_next",
                {
                    "section": "Introduction",
                    "answer": "hello good morning",
                    "phase": "greeting",
                },
            )
            greeting = json.loads(hello.content[0].text)
            assert "Good morning" in greeting["prompt"]
            assert "introduction" in greeting["prompt"].lower()
            follow = await session.call_tool(
                "ask_next",
                {
                    "section": "Background",
                    "answer": "I designed a service and chose a cache to keep reads fast.",
                    "phase": "followup",
                },
            )
            probed = json.loads(follow.content[0].text)
            assert "chose a cache" in probed["prompt"]
            coding = await session.call_tool(
                "ask_next",
                {
                    "section": "Implementation",
                    "answer": "function search(items) { for (const item of items) { return item; } }",
                    "phase": "followup",
                    "interviewType": "coding",
                },
            )
            explained = json.loads(coding.content[0].text)
            assert "loop" in explained["prompt"]
            unclear = await session.call_tool(
                "ask_next",
                {
                    "section": "Background",
                    "answer": "I didn't understand your question",
                    "phase": "explain",
                    "asked": "Tell me about a time you used two pointers.",
                },
            )
            clearer = json.loads(unclear.content[0].text)
            assert "plain words" in clearer["prompt"]
            assert "two pointers" in clearer["prompt"]
            print("ask next ok")

asyncio.run(main())