require('dotenv').config();
const express = require('express');
const fs = require('fs');
/* express 객체 생성 */
const app = express();

app.use('/css', express.static('./static/css'));
app.use('/js', express.static('./static/js'));

/* Get 방식으로 / 경로에 접속하면 실행 됨 */
app.get('/', function (request, response) {
  fs.readFile('./Chess.html', function (err, data) {
    if (err) {
      response.send('에러');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
//이미지관련
app.get('/images0', function (request, response) {
  fs.readFile('./static/images/blank.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images1', function (request, response) {
  fs.readFile('./static/images/black_bishop.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images2', function (request, response) {
  fs.readFile('./static/images/black_king.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images3', function (request, response) {
  fs.readFile('./static/images/black_knight.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images4', function (request, response) {
  fs.readFile('./static/images/black_pawn.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images5', function (request, response) {
  fs.readFile('./static/images/black_queen.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images6', function (request, response) {
  fs.readFile('./static/images/black_rook.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images7', function (request, response) {
  fs.readFile('./static/images/white_bishop.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images8', function (request, response) {
  fs.readFile('./static/images/white_king.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images9', function (request, response) {
  fs.readFile('./static/images/white_knight.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images10', function (request, response) {
  fs.readFile('./static/images/white_pawn.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images11', function (request, response) {
  fs.readFile('./static/images/white_queen.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images12', function (request, response) {
  fs.readFile('./static/images/white_rook.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/images13', function (request, response) {
  fs.readFile('./static/images/이동가능지점.png', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound1', function (request, response) {
  fs.readFile('./static/sound/수를 둠.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound2', function (request, response) {
  fs.readFile('./static/sound/승.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound3', function (request, response) {
  fs.readFile('./static/sound/시계소리.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound4', function (request, response) {
  fs.readFile('./static/sound/시작.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound5', function (request, response) {
  fs.readFile('./static/sound/체크당함.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound6', function (request, response) {
  fs.readFile('./static/sound/턴넘어옴.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});
app.get('/sound7', function (request, response) {
  fs.readFile('./static/sound/패배무승부.mp3', function (err, data) {
    if (err) {
      console.log('err');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write(data);
      response.end();
    }
  });
});

var 접속인원 = 0;
var p1 = '';
var p2 = '';
var p1아이디 = '';
var p2아이디 = '';
function 참가인원() {
  if (p1 === '') {
    return 0;
  } else {
    if (p2 === '') {
      return 1;
    } else {
      return 2;
    }
  }
}

var 게임중 = 0;

const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer, {
  cors: { origin: '*' },
});
const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
  console.log(`[HTTP] Server is started on http://localhost:${port}`);
});

io.on('connection', function (socket) {
  function opponentIdFor(socket) {
    if (socket.id === p1아이디) return p2아이디;
    if (socket.id === p2아이디) return p1아이디;
    return null;
  }

  function isActivePlayer(socket) {
    return 게임중 === 1 && opponentIdFor(socket) !== null;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  /* 새로운 유저가 접속했을 경우 다른 소켓에게도 알려줌 */
  socket.on('newUser', function (name) {
    if (socket.name !== undefined || typeof name !== 'string') {
      return;
    }
    접속인원++;
    console.log(name, ' 님이 접속하였습니다. 접속인원', 접속인원, '명, 참가인원', 참가인원(), '명');

    socket.name = name;

    io.sockets.emit('update', {
      type: 'connect',
      name: 'SERVER',
      message: name + '님이 접속하였습니다.',
      people: 접속인원,
      참가인원: 참가인원(),
    });
  });
  /* 전송한 메시지 받기 */
  socket.on('message', function (data) {
    if (!isObject(data)) {
      return;
    }
    /* 받은 데이터에 누가 보냈는지 이름을 추가 */
    data.name = socket.name;

    console.log(data);

    /* 보낸 사람을 제외한 나머지 유저에게 메시지 전송 */
    socket.broadcast.emit('update', data);
  });

  /* 전송한 기보 받기 */
  socket.on('기보', function (data) {
    if (!isObject(data)) {
      return;
    }
    /* 받은 데이터에 누가 보냈는지 이름을 추가 */
    data.name = socket.name;

    console.log(data);

    /* 보낸 사람을 제외한 나머지 유저에게 메시지 전송 */
    socket.broadcast.emit('update', data);
  });

  /* 접속 종료 */
  socket.on('disconnect', function () {
    if (socket.name == undefined) {
      return 0;
    }
    접속인원--;
    if (socket.id === p1아이디 || socket.id === p2아이디) {
      if (게임중 === 1) {
        console.log('탈주자 검거', socket.id);
        io.sockets.emit('탈주', {
          type: '탈주',
          탈주자아이디: socket.id,
        });
      }
    }
    if (socket.id === p1아이디 && 게임중 === 0) {
      console.log('준비중인 1명이 나감');
      p1 = '';
      p1아이디 = '';
      io.sockets.emit('checkgame', {
        type: 'checkgame',
        p1: p1,
        p2: p2,
        p1아이디: p1아이디,
        p2아이디: p2아이디,
        참가인원: 참가인원(),
      });
    }
    if (접속인원 === 0) {
      게임중 = 0;
    }
    console.log(socket.name + '님이 나가셨습니다. 접속인원', 접속인원, '명, 참가인원', 참가인원(), '명');
    /* 나가는 사람을 제외한 나머지 유저에게 메시지 전송 */
    socket.broadcast.emit('update', {
      type: 'disconnect',
      name: 'SERVER',
      message: socket.name + '님이 나가셨습니다.',
      people: 접속인원,
      참가인원: 참가인원(),
    });
  });

  socket.on('checkmate', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('체크메이트됨');
    io.to(opponentIdFor(socket)).emit('checkmate', data);
  });
  socket.on('check', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('체크됨');
    io.to(opponentIdFor(socket)).emit('check', data);
  });
  socket.on('stail', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('스테일메이트됨');
    io.to(opponentIdFor(socket)).emit('stail', data);
  });
  socket.on('isitstart', function () {
    socket.emit('isitstart', {
      type: 'isitstart',
      게임중: 게임중,
      p1: p1,
    });
  });

  socket.on('readybutton', function (data) {
    //누군가 참가를 눌렀을 때
    if (게임중 === 1 || socket.name === undefined || socket.id === p1아이디 || socket.id === p2아이디) {
      return;
    }
    if (참가인원() === 0) {
      //두칸 다 비어있으면
      p1 = socket.name;
      p1아이디 = socket.id;
    } else if (참가인원() === 1) {
      //한칸만 비어있으면
      p2 = socket.name;
      p2아이디 = socket.id;
    }
    게임시작여부결정(data);
  });
  socket.on('quitbutton', function (data) {
    //누군가 취소를 눌렀을 때
    if (게임중 === 1 || socket.id !== p1아이디 || p2아이디 !== '') {
      return;
    }
    p1 = '';
    p1아이디 = '';
    게임시작여부결정(data);
  });

  socket.on('turnend', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('턴 종료됨');
    var 오십수체크1 = Number(data.오십수체크);
    io.to(opponentIdFor(socket)).emit('turnend', {
      type: 'turnend',
      일차기보: data.일차기보,
      오십수체크: 오십수체크1,
    });
  });
  socket.on('movefinish', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    // io.to(data.상대소켓아이디).emit('movefinish',{type: 'movefinish',nx: data.nx,ny: data.ny,tx:data.tx,ty:data.ty,특수이동:data.특수이동,내가방금y열폰을두칸움직임:data.내가방금y열폰을두칸움직임})
    console.log('보내는 데이터:', data.nx, data.ny, data.tx, data.ty, data.특수이동, data.상대색깔);
    socket.broadcast.emit('movefinish', {
      type: 'movefinish',
      nx: data.nx,
      ny: data.ny,
      tx: data.tx,
      ty: data.ty,
      특수이동: data.특수이동,
      내가방금y열폰을두칸움직임: data.내가방금y열폰을두칸움직임,
      상대색깔: data.상대색깔,
    });
  });
  socket.on('kill', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log(data.잡은말종류, '가 잡혔습니다.');
    io.sockets.emit('kill', {
      type: 'kill',
      잡은말종류: data.잡은말종류,
      잡은말색깔: data.잡은말색깔,
    });
  });
  socket.on('draw', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('무승부 신청 들어옴');
    io.to(opponentIdFor(socket)).emit('drawgomin', data);
  });
  socket.on('drawno', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('무승부 거절 들어옴');
    io.to(opponentIdFor(socket)).emit('drawnogomin', data);
  });

  socket.on('기보보내기', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    io.sockets.emit('기보보내기', { type: '기보보내기', 기보: data.기보 });
  });

  socket.on('gamestart', function (data) {
    if (게임중 === 1 || socket.id !== p1아이디 || p2아이디 === '') {
      return;
    }
    console.log('GAME START');
    게임중 = 1;
    io.sockets.emit('gamestart', { type: 'gamestart', 게임중: 게임중 });
  });
  socket.on('gameend', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('GAME END');
    p1 = '';
    p2 = '';
    p1아이디 = '';
    p2아이디 = '';
    게임중 = 0;
    io.sockets.emit('gameend', {
      type: 'gameend',
      승자: data.승자,
      정산결과: data.정산결과,
    });
  });
  socket.on('realgameend', function () {});

  socket.on('starttimer', function (data) {
    if (!isActivePlayer(socket) || !isObject(data)) {
      return;
    }
    console.log('타이머 가동');
    io.sockets.emit('starttimer', { type: 'starttimer', 색깔: data.색깔 });
  });

  function 게임시작여부결정(data) {
    console.log('p1:', p1, 'p2:', p2, '참가인원:', 참가인원());
    var a = Math.floor(Math.random() * 2) + 1;
    if (참가인원() === 2) {
      io.to(p1아이디).emit('invite1', data);
      io.to(p2아이디).emit('invite2', data);
    }
    io.sockets.emit('checkgame', {
      type: 'checkgame',
      p1: p1,
      p2: p2,
      p1아이디: p1아이디,
      p2아이디: p2아이디,
      선턴정하기신호: a,
      참가인원: 참가인원(),
    });
  }
});
