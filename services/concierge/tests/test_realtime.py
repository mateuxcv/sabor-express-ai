import asyncio
import json
import os
import time
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from models import ChatReply, PendingAction, Routing
from realtime import Call, CallContext, CallManager, CallStart, Turn
from realtime_config import RealtimeConfig, RealtimeError, realtime_status

CONFIG = {"AZURE_ENDPOINT": "https://voice-test.openai.azure.com/openai/v1", "AZURE_API_KEY": "resource-test-key", "AZURE_REALTIME_DEPLOYMENT": "gpt-realtime-2.1", "AZURE_REALTIME_USE_CHAT_KEY": "true"}
SDP = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"


def reply(pending=None):
    return ChatReply(text="Confira o resumo. Posso confirmar?", topic="Teste", routing=Routing(agent="reservations", reason="Teste", summary="Teste"), pendingAction=pending)


def make_call():
    config = RealtimeConfig(base_url="https://voice-test.openai.azure.com/openai/v1/", deployment="gpt-realtime-2.1", key="resource-test-key")
    call = Call(id="local-call", token="local-private-capability", remote_id="rtc_remote", context=CallContext(id="conversation", name="Cliente", store="São Paulo · Pinheiros", status="ai"), config=config)
    call.websocket = AsyncMock()
    call.response_idle.set()
    call.status = "active"
    return call


class RealtimeConfigTests(unittest.TestCase):
    def test_session_has_ga_voice_tools_and_short_lived_secret(self):
        with patch.dict(os.environ, CONFIG, clear=True):
            config = RealtimeConfig.from_env()
        session = config.session_payload(make_call().context)
        self.assertEqual(session["session"]["model"], "gpt-realtime-2.1")
        self.assertEqual(session["session"]["audio"]["output"]["voice"], "marin")
        self.assertTrue(session["session"]["audio"]["input"]["turn_detection"]["interrupt_response"])
        self.assertFalse(session["session"]["audio"]["input"]["turn_detection"]["create_response"])
        self.assertEqual(session["session"]["tools"], [])
        self.assertEqual(session["session"]["tool_choice"], "none")
        self.assertEqual(session["expires_after"]["seconds"], 60)
        self.assertNotIn(config.key, json.dumps(session))
        self.assertNotIn(config.key, repr(config))

    def test_status_does_not_expose_keys(self):
        with patch.dict(os.environ, CONFIG, clear=True):
            status = realtime_status()
        self.assertTrue(status["ready"])
        self.assertNotIn("resource-test-key", json.dumps(status))

    def test_missing_or_wrong_configuration_fails(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(realtime_status()["ready"])
        for name, value in [("AZURE_REALTIME_ENDPOINT", "https://voice-test.openai.azure.com/openai/v1/realtime/calls"), ("AZURE_REALTIME_MAX_SECONDS", "100000"), ("AZURE_REALTIME_DEPLOYMENT", "azure/model")]:
            with self.subTest(name=name), patch.dict(os.environ, {**CONFIG, name: value}, clear=True):
                self.assertFalse(realtime_status()["ready"])


class RealtimeControllerTests(unittest.IsolatedAsyncioTestCase):
    async def test_confirmation_comes_from_transcript_and_heard_quote(self):
        executor = AsyncMock(return_value=reply())
        manager, call = CallManager(executor), make_call()
        call.speaking_quote = "quote-1"
        call.active_response_id = "summary"
        call.response_quotes["summary"] = "quote-1"
        call.completed_responses.add("summary")
        await manager.event(call, {"type": "output_audio_buffer.stopped"})
        await manager.event(call, {"type": "input_audio_buffer.speech_started", "item_id": "turn-1"})
        await manager.event(call, {"type": "input_audio_buffer.speech_stopped"})
        await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": "turn-1", "transcript": "sim"})
        await call.jobs["turn-1"]
        request = executor.call_args.args[0]
        self.assertEqual(request.confirmationId, "quote-1")
        self.assertEqual(request.conversation.messages[-1].text, "sim")
        self.assertEqual(request.conversation.id, "conversation")

    async def test_interrupted_summary_does_not_authorize_confirmation(self):
        executor = AsyncMock(return_value=reply())
        manager, call = CallManager(executor), make_call()
        call.speaking_quote = "quote-1"
        call.active_response_id = "summary"
        call.response_quotes["summary"] = "quote-1"
        call.completed_responses.add("summary")
        await manager.event(call, {"type": "output_audio_buffer.cleared"})
        await manager.event(call, {"type": "output_audio_buffer.stopped"})
        await manager.event(call, {"type": "input_audio_buffer.speech_started", "item_id": "turn-1"})
        await manager.event(call, {"type": "input_audio_buffer.speech_stopped"})
        await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": "turn-1", "transcript": "sim"})
        await call.jobs["turn-1"]
        self.assertIsNone(executor.call_args.args[0].confirmationId)

    async def test_model_cannot_supply_fake_consent_or_choose_another_tool(self):
        executor = AsyncMock()
        manager, call = CallManager(executor), make_call()
        turn = Turn("turn-1", None, transcript="quero o cardápio")
        turn.ready.set(); call.turns[turn.id] = turn; call.latest_turn = turn.id
        await manager.event(call, {"type": "response.function_call_arguments.done", "call_id": "tool-1", "name": "atender_cliente", "arguments": '{"transcript":"sim","confirmationId":"fake"}'})
        await manager.event(call, {"type": "response.function_call_arguments.done", "call_id": "tool-2", "name": "executar_sql", "arguments": "{}"})
        executor.assert_not_called()

    async def test_late_tool_does_not_execute_for_previous_turn(self):
        executor = AsyncMock()
        manager, call = CallManager(executor), make_call()
        turn = Turn("old", "quote-1", transcript="sim")
        turn.ready.set(); call.turns[turn.id] = turn; call.latest_turn = "new"
        await manager.respond_turn(call, "old")
        executor.assert_not_called()

    async def test_tool_waits_for_server_transcription(self):
        executor = AsyncMock(return_value=reply())
        manager, call = CallManager(executor), make_call()
        call.latest_turn = "turn-1"; call.turns["turn-1"] = Turn("turn-1", None)
        job = asyncio.create_task(manager.respond_turn(call, "turn-1"))
        await asyncio.sleep(0)
        executor.assert_not_called()
        await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": "turn-1", "transcript": "para quatro pessoas"})
        await job
        self.assertEqual(executor.call_args.args[0].conversation.messages[-1].text, "para quatro pessoas")

    async def test_duplicate_tool_event_is_ignored(self):
        executor = AsyncMock()
        manager, call = CallManager(executor), make_call()
        event = {"type": "response.function_call_arguments.done", "call_id": "tool-1", "name": "atender_cliente", "arguments": "{}"}
        await manager.event(call, event); await manager.event(call, event)
        executor.assert_not_called()
        call.websocket.send.assert_not_called()

    async def test_single_greeting_has_one_reply_even_with_duplicate_events(self):
        executor = AsyncMock()
        manager, call = CallManager(executor), make_call()
        start = {"type": "input_audio_buffer.speech_started", "item_id": "greeting"}
        stop = {"type": "input_audio_buffer.speech_stopped", "item_id": "greeting"}
        transcript = {"type": "conversation.item.input_audio_transcription.completed", "item_id": "greeting", "transcript": "Oi, tudo bem?"}
        await manager.event(call, start); await manager.event(call, stop); await manager.event(call, transcript)
        await call.jobs["greeting"]
        for _ in range(4):
            await manager.event(call, start); await manager.event(call, stop); await manager.event(call, transcript)
            await manager.respond_turn(call, "greeting")
        creates = [json.loads(item.args[0]) for item in call.websocket.send.call_args_list if json.loads(item.args[0])["type"] == "response.create"]
        self.assertEqual(len(creates), 1)
        self.assertIn("Tudo bem, sim!", creates[0]["response"]["input"][0]["content"][0]["text"])
        self.assertEqual(creates[0]["response"]["conversation"], "none")
        executor.assert_not_called()

    async def test_transcript_before_stop_waits_for_complete_turn(self):
        manager, call = CallManager(AsyncMock()), make_call()
        await manager.event(call, {"type": "input_audio_buffer.speech_started", "item_id": "greeting"})
        await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": "greeting", "transcript": "tudo bem?"})
        self.assertEqual(len(call.jobs), 0)
        await manager.event(call, {"type": "input_audio_buffer.speech_stopped", "item_id": "greeting"})
        await call.jobs["greeting"]
        self.assertEqual(call.websocket.send.call_count, 1)

    async def test_same_words_in_a_new_user_turn_are_not_globally_suppressed(self):
        manager, call = CallManager(AsyncMock()), make_call()
        for index in range(2):
            turn_id, response_id = f"turn-{index}", f"response-{index}"
            await manager.event(call, {"type": "input_audio_buffer.speech_started", "item_id": turn_id})
            await manager.event(call, {"type": "input_audio_buffer.speech_stopped", "item_id": turn_id})
            await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": turn_id, "transcript": "tudo bem?"})
            await call.jobs[turn_id]
            await manager.event(call, {"type": "response.created", "response": {"id": response_id, "metadata": {"purpose": "reply", "turn_id": turn_id}}})
            await manager.event(call, {"type": "response.done", "response": {"id": response_id, "status": "completed"}})
            await manager.event(call, {"type": "output_audio_buffer.stopped", "response_id": response_id})
        creates = [json.loads(item.args[0]) for item in call.websocket.send.call_args_list if json.loads(item.args[0])["type"] == "response.create"]
        self.assertEqual(len(creates), 2)

    async def test_late_stop_of_interrupted_response_does_not_release_old_quote(self):
        manager, call = CallManager(AsyncMock()), make_call()
        call.response_quotes["old"] = "old-quote"
        call.completed_responses.add("old")
        call.interrupted_responses.add("old")
        call.active_response_id = "new"
        call.interrupted = False
        await manager.event(call, {"type": "output_audio_buffer.stopped", "response_id": "old"})
        self.assertIsNone(call.heard_quote)

    async def test_unrequested_response_is_cancelled_without_generating_another(self):
        manager, call = CallManager(AsyncMock()), make_call()
        await manager.event(call, {"type": "response.created", "response": {"id": "unrequested", "metadata": {}}})
        sent = json.loads(call.websocket.send.call_args.args[0])
        self.assertEqual(sent, {"type": "response.cancel", "response_id": "unrequested"})
        self.assertTrue(call.response_idle.is_set())

    async def test_playback_echo_is_ignored_but_short_confirmation_is_not(self):
        manager, call = CallManager(AsyncMock()), make_call()
        call.last_assistant_text = "Olá, eu sou a Lia, assistente virtual da Sabor Express."
        call.playback_active = True
        await manager.event(call, {"type": "input_audio_buffer.speech_started", "item_id": "echo"})
        await manager.event(call, {"type": "input_audio_buffer.speech_stopped", "item_id": "echo"})
        await manager.event(call, {"type": "conversation.item.input_audio_transcription.completed", "item_id": "echo", "transcript": call.last_assistant_text})
        self.assertTrue(call.turns["echo"].ignored)
        self.assertEqual(len(call.jobs), 0)
        self.assertFalse(manager.is_echo(call, Turn("confirmation", None, transcript="sim", during_playback=True)))

    async def test_call_capability_is_required_and_snapshot_has_no_secret(self):
        manager, call = CallManager(AsyncMock()), make_call()
        manager.calls[call.id] = call
        with self.assertRaises(RealtimeError): manager.get(call.id, "wrong")
        self.assertEqual(manager.get(call.id, call.token), call)
        snapshot = json.dumps(call.snapshot())
        self.assertNotIn(call.token, snapshot)
        self.assertNotIn(call.config.key, snapshot)

    async def test_expired_heartbeat_ends_remote_call(self):
        manager, call = CallManager(AsyncMock()), make_call()
        call.last_seen = time.monotonic() - 30
        manager.occupied.add(call.context.id)
        with patch("realtime.asyncio.sleep", AsyncMock()), patch.object(manager, "hangup_remote", AsyncMock()) as hangup:
            await manager.monitor(call)
        self.assertEqual(call.status, "ended")
        self.assertEqual(call.reason, "disconnected")
        self.assertNotIn(call.context.id, manager.occupied)
        hangup.assert_awaited_once()

    async def test_negotiation_keeps_azure_secret_on_server(self):
        manager = CallManager(AsyncMock())
        real_client = httpx.AsyncClient

        def handler(request):
            if request.url.path.endswith("/client_secrets"):
                self.assertEqual(request.headers["api-key"], "resource-test-key")
                return httpx.Response(200, json={"value": "azure-ephemeral-private"})
            self.assertTrue(request.url.path.endswith("/realtime/calls"))
            self.assertEqual(request.headers["authorization"], "Bearer azure-ephemeral-private")
            self.assertEqual(request.headers["content-type"], "application/sdp")
            return httpx.Response(201, text=SDP, headers={"Location": "/openai/v1/realtime/calls/rtc_remote"})

        async def observer(call):
            call.websocket = AsyncMock(); call.status = "active"; call.ready.set()

        with patch.dict(os.environ, CONFIG, clear=True), patch("realtime.httpx.AsyncClient", side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)), patch.object(manager, "observe", observer), patch.object(manager, "hangup_remote", AsyncMock()):
            result = await manager.start(CallStart(sdp=SDP, conversation=make_call().context))
            self.assertNotIn("azure-ephemeral-private", json.dumps(result))
            self.assertNotIn("resource-test-key", json.dumps(result))
            call = manager.get(result["id"], result["token"])
            await manager.end(call)

    async def test_second_call_in_same_conversation_is_rejected(self):
        manager = CallManager(AsyncMock())
        manager.occupied.add("conversation")
        with patch.dict(os.environ, CONFIG, clear=True), self.assertRaises(RealtimeError) as error:
            await manager.start(CallStart(sdp=SDP, conversation=make_call().context))
        self.assertEqual(error.exception.status, 409)
