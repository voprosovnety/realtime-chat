<?php

namespace App\Tests\Api;

use App\Entity\Message;
use Symfony\Component\Uid\Uuid;

final class MessageApiTest extends ApiTestCase
{
    public function testCannotForwardMessageFromChatWithoutMembership(): void
    {
        $owner = $this->createUser('source_owner');
        $outsider = $this->createUser('outsider');
        $source = $this->createGroupChat($owner);
        $target = $this->createGroupChat($outsider);
        $message = $this->createMessage($source, $owner, 'private source content');
        $message->setAttachments([['url' => '/uploads/private-file.pdf', 'type' => 'file', 'name' => 'private.pdf']]);
        $this->em->flush();

        $client = $this->createAuthenticatedClient($outsider);
        $client->jsonRequest('POST', sprintf('/api/chats/%s/messages', $target->getId()), [
            'forwarded_from_id' => (string) $message->getId(),
        ]);

        self::assertSame(400, $client->getResponse()->getStatusCode());
        self::assertSame(['error' => 'invalid forwarded_from_id'], json_decode(
            $client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR,
        ));
        self::assertSame(0, $this->hub->count());

        $client->request('GET', sprintf('/api/chats/%s/messages', $target->getId()));
        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame([], json_decode($client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR)['items']);
    }

    public function testMemberCanForwardContentAndAttachments(): void
    {
        $owner = $this->createUser('source_owner');
        $member = $this->createUser('member');
        $source = $this->createGroupChat($owner, [$member]);
        $target = $this->createGroupChat($member);
        $message = $this->createMessage($source, $owner, 'shared content');
        $attachments = [['url' => '/uploads/shared.pdf', 'type' => 'file', 'name' => 'shared.pdf']];
        $message->setAttachments($attachments);
        $message->setAttachmentUrl('/uploads/legacy.png');
        $message->setAttachmentType('image');
        $message->setAttachmentName('legacy.png');
        $this->em->flush();

        $client = $this->createAuthenticatedClient($member);
        $client->jsonRequest('POST', sprintf('/api/chats/%s/messages', $target->getId()), [
            'forwarded_from_id' => (string) $message->getId(),
        ]);

        self::assertSame(201, $client->getResponse()->getStatusCode());
        $payload = json_decode($client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertSame('shared content', $payload['content']);
        self::assertSame('source_owner', $payload['forwarded_from']);
        self::assertSame($attachments, $payload['attachments']);
        self::assertSame('/uploads/legacy.png', $payload['attachment_url']);
        self::assertSame('image', $payload['attachment_type']);
        self::assertSame('legacy.png', $payload['attachment_name']);
        self::assertSame(1, $this->hub->count());
    }

    public function testUnavailableForwardSourcesHaveIdenticalResponses(): void
    {
        $owner = $this->createUser('source_owner');
        $member = $this->createUser('member');
        $source = $this->createGroupChat($owner, [$member]);
        $foreignChat = $this->createGroupChat($owner);
        $target = $this->createGroupChat($member);
        $deleted = $this->createMessage($source, $owner, 'deleted content');
        $deleted->setDeletedAt(new \DateTimeImmutable());
        $foreign = $this->createMessage($foreignChat, $owner, 'private content');
        $foreignDeleted = $this->createMessage($foreignChat, $owner, 'private deleted content');
        $foreignDeleted->setDeletedAt(new \DateTimeImmutable());
        $this->em->flush();

        $client = $this->createAuthenticatedClient($member);
        foreach ([$deleted->getId(), $foreign->getId(), $foreignDeleted->getId(), Uuid::v7()] as $sourceId) {
            $client->jsonRequest('POST', sprintf('/api/chats/%s/messages', $target->getId()), [
                'forwarded_from_id' => (string) $sourceId,
            ]);
            self::assertSame(400, $client->getResponse()->getStatusCode());
            self::assertSame(['error' => 'invalid forwarded_from_id'], json_decode(
                $client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR,
            ));
        }
        self::assertSame(0, $this->hub->count());
        $client->request('GET', sprintf('/api/chats/%s/messages', $target->getId()));
        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame([], json_decode($client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR)['items']);
    }

    public function testSourceMemberCannotForwardIntoForeignChat(): void
    {
        $owner = $this->createUser('owner');
        $member = $this->createUser('member');
        $source = $this->createGroupChat($member);
        $target = $this->createGroupChat($owner);
        $message = $this->createMessage($source, $member);

        $client = $this->createAuthenticatedClient($member);
        $client->jsonRequest('POST', sprintf('/api/chats/%s/messages', $target->getId()), [
            'forwarded_from_id' => (string) $message->getId(),
        ]);

        self::assertSame(403, $client->getResponse()->getStatusCode());
        self::assertSame(0, $this->hub->count());
    }

    public function testAuthorCanEditOwnMessage(): void
    {
        $author = $this->createUser('author');
        $chat = $this->createGroupChat($author);
        $message = $this->createMessage($chat, $author, 'before');

        $client = $this->createAuthenticatedClient($author);
        $client->jsonRequest('PATCH', sprintf('/api/chats/%s/messages/%s', $chat->getId(), $message->getId()), [
            'content' => 'after',
        ]);

        self::assertSame(200, $client->getResponse()->getStatusCode());
        $payload = json_decode($client->getResponse()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertSame('after', $payload['content']);

        $updated = $this->em->getRepository(Message::class)->find((string) $message->getId());
        self::assertSame('after', $updated?->getContent());
        self::assertNotNull($updated?->getEditedAt());
    }

    public function testNonAuthorCannotEditForeignMessage(): void
    {
        $author = $this->createUser('author');
        $member = $this->createUser('member');
        $chat = $this->createGroupChat($author, [$member]);
        $message = $this->createMessage($chat, $author, 'before');

        $client = $this->createAuthenticatedClient($member);
        $client->jsonRequest('PATCH', sprintf('/api/chats/%s/messages/%s', $chat->getId(), $message->getId()), [
            'content' => 'hacked',
        ]);

        self::assertSame(403, $client->getResponse()->getStatusCode());
    }

    public function testAuthorCanDeleteOwnMessage(): void
    {
        $author = $this->createUser('author');
        $chat = $this->createGroupChat($author);
        $message = $this->createMessage($chat, $author, 'bye');

        $client = $this->createAuthenticatedClient($author);
        $client->request('DELETE', sprintf('/api/chats/%s/messages/%s', $chat->getId(), $message->getId()));

        self::assertSame(200, $client->getResponse()->getStatusCode());

        $deleted = $this->em->getRepository(Message::class)->find((string) $message->getId());
        self::assertNotNull($deleted?->getDeletedAt());
    }

    public function testNonAuthorCannotDeleteForeignMessage(): void
    {
        $author = $this->createUser('author');
        $member = $this->createUser('member');
        $chat = $this->createGroupChat($author, [$member]);
        $message = $this->createMessage($chat, $author, 'bye');

        $client = $this->createAuthenticatedClient($member);
        $client->request('DELETE', sprintf('/api/chats/%s/messages/%s', $chat->getId(), $message->getId()));

        self::assertSame(403, $client->getResponse()->getStatusCode());
    }
}
