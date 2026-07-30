import { prisma } from '../../db'
import { AppError } from '../../errors'
import { realtime } from '../../realtime'
import {
  directMessageDtoSchema,
  directMessageInclude,
  toDirectMessageDto,
  type DirectMessageDto,
} from './direct-message.dto'
import { canonicalFriendPair } from './friend.service'

class FriendshipRequiredError extends AppError {
  constructor() {
    super(
      'FRIENDSHIP_REQUIRED',
      403,
      'an accepted friendship is required to exchange direct messages',
    )
  }
}

async function requireAcceptedFriendship(
  userId: string,
  friendUserId: string,
): Promise<void> {
  if (userId === friendUserId) throw new FriendshipRequiredError()

  const pair = canonicalFriendPair(userId, friendUserId)
  const friendship = await prisma.friendship.findUnique({
    where: { user_low_id_user_high_id: pair },
    select: { user_low_id: true },
  })
  if (!friendship) throw new FriendshipRequiredError()
}

function publishDirectMessageCreated(message: DirectMessageDto): void {
  try {
    const event = directMessageDtoSchema.parse(message)
    realtime.sendToUser(
      event.author.user_id,
      'dm.message_created',
      event,
    )
    realtime.sendToUser(
      event.recipient.user_id,
      'dm.message_created',
      event,
    )
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "dm.message_created"',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function listDirectMessages(input: {
  userId: string
  friendUserId: string
}) {
  await requireAcceptedFriendship(input.userId, input.friendUserId)

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        {
          sender_user_id: input.userId,
          recipient_user_id: input.friendUserId,
        },
        {
          sender_user_id: input.friendUserId,
          recipient_user_id: input.userId,
        },
      ],
    },
    include: directMessageInclude,
    orderBy: [
      { created_at: 'desc' },
      { id: 'desc' },
    ],
    take: 100,
  })

  return messages.reverse().map(toDirectMessageDto)
}

export async function createDirectMessage(input: {
  userId: string
  friendUserId: string
  content: string
}) {
  await requireAcceptedFriendship(input.userId, input.friendUserId)

  const message = await prisma.directMessage.create({
    data: {
      sender_user_id: input.userId,
      recipient_user_id: input.friendUserId,
      content: input.content,
    },
    include: directMessageInclude,
  })
  const dto = toDirectMessageDto(message)

  publishDirectMessageCreated(dto)
  return dto
}
