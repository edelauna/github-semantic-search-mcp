import { OUTBOX_TYPE } from "../types/types"

type IndexProperties = {
  owner: string,
  name: string,
  path: string,
  key: string
}

export const outboxMapper = <T extends OUTBOX_TYPE>(type: T) => {
  switch (type) {
    case 'index': return ({
      serialize: indexSerializer,
      deserialize: indexDeserializer
    })
    default: throw new Error('Invalid type')
  }
}

const INDEX_SPLIT_CHAR = '~'

const indexSerializer = ({ owner, name, path, key }: IndexProperties) =>
  `${owner}${INDEX_SPLIT_CHAR}${name}${INDEX_SPLIT_CHAR}${path}${INDEX_SPLIT_CHAR}${key}`

const indexDeserializer = (msg: string): IndexProperties => {
  const parts = msg.split(INDEX_SPLIT_CHAR)
  const [owner, name, ...rest] = parts
  const key = rest.pop()
  if (!key) throw new Error("Missing key in index outbox deserialization")

  const path = rest.join(INDEX_SPLIT_CHAR)

  return {
    owner, name, key, path
  }
}
