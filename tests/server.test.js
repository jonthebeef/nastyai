const request = require('supertest');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

describe('Command Center Server', () => {
  let io, serverSocket, clientSocket, httpServer;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = new Client(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  test('should emit command events', (done) => {
    clientSocket.on('commandIssued', (data) => {
      expect(data).toHaveProperty('command');
      expect(data).toHaveProperty('systemCommand');
      done();
    });

    serverSocket.emit('commandIssued', {
      command: 'test command',
      systemCommand: 'echo test'
    });
  });

  test('should handle command output', (done) => {
    clientSocket.on('commandOutput', (data) => {
      expect(data).toHaveProperty('type');
      expect(data).toHaveProperty('data');
      expect(data.type).toBe('stdout');
      done();
    });

    serverSocket.emit('commandOutput', {
      type: 'stdout',
      data: 'test output'
    });
  });

  test('should handle command completion', (done) => {
    clientSocket.on('commandFinished', (data) => {
      expect(data).toHaveProperty('code');
      expect(data.code).toBe(0);
      done();
    });

    serverSocket.emit('commandFinished', {
      code: 0,
      signal: null
    });
  });
});

describe('Command Translation', () => {
  test('should translate known commands', () => {
    const commands = [
      ['status', 'uptime && free -h && df -h'],
      ['memory', 'free -h'],
      ['temperature', 'vcgencmd measure_temp']
    ];

    commands.forEach(([input, expected]) => {
      const result = translateCommand(input);
      expect(result).toBe(expected);
    });
  });

  test('should handle unknown commands gracefully', () => {
    const result = translateCommand('nonexistent_command');
    expect(result).toContain('Unknown command');
    expect(result).toContain('Available commands');
  });
}); 