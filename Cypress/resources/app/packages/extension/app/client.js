const { client, circularParser } = require('../../socket/lib/browser')

const connect = (host, path) => {
  return client.connect(host, {
    path,
    transports: ['websocket'],
    // @ts-ignore
    parser: circularParser,
  })
}

module.exports = {
  connect,

  socketIoClient: client,

  socketIoParser: circularParser,
}
