"""Repository tests against a real MongoDB.

These skip automatically when no server is reachable; see the `mongo_database`
fixture in conftest.py.
"""

import pytest

from app.repositories.conversations import ConversationRepository
from app.schemas import ChatMessage


@pytest.fixture
async def repository(mongo_database) -> ConversationRepository:
    repo = ConversationRepository(mongo_database)
    await repo.ensure_indexes()
    return repo


async def test_create_and_get_roundtrip(repository):
    created = await repository.create(title="Lineare Algebra")

    fetched = await repository.get(created.id)

    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.title == "Lineare Algebra"
    assert fetched.messages == []
    assert fetched.created_at.tzinfo is not None


async def test_append_messages_accumulates_and_bumps_updated_at(repository):
    conversation = await repository.create()

    after_first = await repository.append_messages(
        conversation.id, [ChatMessage(role="user", content="Was ist ein Vektorraum?")]
    )
    assert after_first is not None
    assert [message.content for message in after_first.messages] == ["Was ist ein Vektorraum?"]

    after_second = await repository.append_messages(
        conversation.id, [ChatMessage(role="assistant", content="Eine Menge mit ...")]
    )
    assert after_second is not None
    assert [message.role for message in after_second.messages] == ["user", "assistant"]
    assert after_second.updated_at >= after_first.updated_at
    assert after_second.created_at == conversation.created_at


async def test_list_recent_orders_by_updated_at_desc(repository):
    first = await repository.create(title="first")
    second = await repository.create(title="second")
    # Touching `first` must move it ahead of `second`.
    await repository.append_messages(first.id, [ChatMessage(role="user", content="ping")])

    recent = await repository.list_recent(limit=10)

    assert [conversation.id for conversation in recent[:2]] == [first.id, second.id]


async def test_list_recent_honours_limit(repository):
    for index in range(3):
        await repository.create(title=f"conversation {index}")

    assert len(await repository.list_recent(limit=2)) == 2


async def test_delete_removes_the_conversation(repository):
    conversation = await repository.create()

    assert await repository.delete(conversation.id) is True
    assert await repository.get(conversation.id) is None
    assert await repository.delete(conversation.id) is False


@pytest.mark.parametrize("bad_id", ["not-an-object-id", "", "12345"])
async def test_malformed_ids_are_misses_not_errors(repository, bad_id):
    assert await repository.get(bad_id) is None
    assert await repository.append_messages(bad_id, [ChatMessage(role="user", content="x")]) is None
    assert await repository.delete(bad_id) is False


async def test_unknown_but_valid_id_is_a_miss(repository):
    missing = "0" * 24

    assert await repository.get(missing) is None
    appended = await repository.append_messages(missing, [ChatMessage(role="user", content="x")])
    assert appended is None
