var socket = io()

var 게임중=0
var 접속인원=0                          //현재 접속인원
var 참가인원=-1
var p1=''
var p2=''
var p1아이디=''
var p2아이디=''
var 선턴정하기신호                        
var 내닉네임
var 내소켓아이디=''
var 상대소켓아이디=''


var temp //프로모션하는중 잡은말

var 입장코드=0                            
var 선공=0                                //흰색 1 검정색 0 관전자 -1
var 내턴=0
var 정산결과=-1

var 킹움직인적없음=1
var 왼쪽룩움직인적없음=1
var 오른쪽룩움직인적없음=1
var 상대가전턴에y열폰을두칸움직임=-1
var 내가방금y열폰을두칸움직임=-1


var 제한시간=-1



var 체스판=[]
for(var i=1;i<9;i++){
  체스판.push([])
}
var 체스판말의색=[]
for(var i=1;i<9;i++){
  체스판말의색.push([])
}
function 기초세팅흰색편(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      체스판[i][j]=''
      체스판말의색[i][j]=''
    }
  }
  for(var i=0;i<8;i++){
    체스판말의색[0][i]='검정'
    체스판말의색[1][i]='검정'
    체스판말의색[6][i]='하양'
    체스판말의색[7][i]='하양'
  }
  for(var i=0;i<8;i+=7){
    체스판[i][0]='룩'
    체스판[i][1]='나이트'
    체스판[i][2]='비숍'
    체스판[i][3]='퀸'
    체스판[i][4]='킹'
    체스판[i][5]='비숍'
    체스판[i][6]='나이트'
    체스판[i][7]='룩'
  }
  for(var i=0;i<8;i++){
    체스판[1][i]='폰'
    체스판[6][i]='폰'
  }
  var 프로모션버튼1=document.getElementById('p1')
  프로모션버튼1.src='images11'
  var 프로모션버튼2=document.getElementById('p2')
  프로모션버튼2.src='images12'
  var 프로모션버튼3=document.getElementById('p3')
  프로모션버튼3.src='images7'
  var 프로모션버튼4=document.getElementById('p4')
  프로모션버튼4.src='images9'
}
function 기초세팅검정색편(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      체스판[i][j]=''
      체스판말의색[i][j]=''
    }
  }
  for(var i=0;i<8;i++){
    체스판말의색[6][i]='검정'
    체스판말의색[7][i]='검정'
    체스판말의색[0][i]='하양'
    체스판말의색[1][i]='하양'
  }
  for(var i=0;i<8;i+=7){
    체스판[i][0]='룩'
    체스판[i][1]='나이트'
    체스판[i][2]='비숍'
    체스판[i][3]='킹'
    체스판[i][4]='퀸'
    체스판[i][5]='비숍'
    체스판[i][6]='나이트'
    체스판[i][7]='룩'
  }
  for(var i=0;i<8;i++){
    체스판[1][i]='폰'
    체스판[6][i]='폰'
  }
  var 프로모션버튼1=document.getElementById('p1')
  프로모션버튼1.src='images5'
  var 프로모션버튼2=document.getElementById('p2')
  프로모션버튼2.src='images6'
  var 프로모션버튼3=document.getElementById('p3')
  프로모션버튼3.src='images1'
  var 프로모션버튼4=document.getElementById('p4')
  프로모션버튼4.src='images3'
}
function 숫자세팅흰색편(){
  for(var i=0;i<8;i++){
    var 그칸아이디=String(10*i)
    var 그칸=document.getElementById(그칸아이디)
    var 숫자=document.createElement('div')
    숫자.textContent=String(8-i)
    숫자.style.position='relative'
    숫자.style.marginBottom='-20px'
    숫자.style.marginLeft='1px'
    숫자.className='no-drag'
    그칸.appendChild(숫자)
    if(i===7){
      숫자.style.marginBottom='-40px'
    }
  }
  for(var i=0;i<8;i++){
    var 숫자알파벳대응=['a','b','c','d','e','f','g','h']
    var 그칸아이디=String(70+i)
    var 그칸=document.getElementById(그칸아이디)
    var 숫자=document.createElement('div')
    숫자.textContent=숫자알파벳대응[i]
    숫자.style.position='relative'
    숫자.style.top='55px'
    숫자.style.marginTop='-20px'
    숫자.style.left='45px'
    숫자.className='no-drag'
    그칸.appendChild(숫자)
  }
}
function 숫자세팅검정색편(){
  for(var i=0;i<8;i++){
    var 그칸아이디=String(10*i)
    var 그칸=document.getElementById(그칸아이디)
    var 숫자=document.createElement('div')
    숫자.textContent=String(i+1)
    숫자.style.position='relative'
    숫자.style.marginBottom='-20px'
    숫자.style.marginLeft='1px'
    숫자.className='no-drag'
    그칸.appendChild(숫자)
    if(i===7){
      숫자.style.marginBottom='-40px'
    }
  }
  for(var i=0;i<8;i++){
    var 숫자알파벳대응=['a','b','c','d','e','f','g','h']
    var 그칸아이디=String(70+i)
    var 그칸=document.getElementById(그칸아이디)
    var 숫자=document.createElement('div')
    숫자.textContent=숫자알파벳대응[7-i]
    숫자.style.position='relative'
    숫자.style.top='55px'
    숫자.style.marginTop='-20px'
    숫자.style.left='45px'
    숫자.className='no-drag'
    그칸.appendChild(숫자)
  }
}
function 체스판채우기(){

  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그칸아이디=String(i*10+j)
      var 그칸=document.getElementById(그칸아이디)
      while(그칸.hasChildNodes()){
        그칸.removeChild(그칸.firstChild)
      }
    }
  }

  if(내색깔()==='하양'){
    숫자세팅흰색편()
  }else{
    숫자세팅검정색편()
  }

  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){

      var 그칸아이디=String(i*10+j)
      var 그칸=document.getElementById(그칸아이디)

      그칸.droppable=true
      그칸.addEventListener('drop',드롭)

      if(체스판말의색[i][j]==='검정'){
        if(체스판[i][j]==='비숍'){
          var 체스말=document.createElement('img')
          체스말.src='images1'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='킹'){
          var 체스말=document.createElement('img')
          체스말.src='images2'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='나이트'){
          var 체스말=document.createElement('img')
          체스말.src='images3'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='폰'){
          var 체스말=document.createElement('img')
          체스말.src='images4'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='퀸'){
          var 체스말=document.createElement('img')
          체스말.src='images5'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='룩'){
          var 체스말=document.createElement('img')
          체스말.src='images6'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===0){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }
      }else if(체스판말의색[i][j]==='하양'){
        if(체스판[i][j]==='비숍'){
          var 체스말=document.createElement('img')
          체스말.src='images7'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='킹'){
          var 체스말=document.createElement('img')
          체스말.src='images8'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='나이트'){
          var 체스말=document.createElement('img')
          체스말.src='images9'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='폰'){
          var 체스말=document.createElement('img')
          체스말.src='images10'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='퀸'){
          var 체스말=document.createElement('img')
          체스말.src='images11'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }else if(체스판[i][j]==='룩'){
          var 체스말=document.createElement('img')
          체스말.src='images12'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
            
          })
          if(내턴===1&&선공===1){
            체스말.draggable=true
          }else{
            체스말.draggable=false
          }
        }
      }else{
        var 체스말=document.createElement('img')
          체스말.src='images0'
          체스말.alt='체스말'
          그칸.appendChild(체스말)
          체스말.addEventListener('dragstart',집음)
          체스말.addEventListener('dragover',function(e){
            e.preventDefault()
          })
          체스말.draggable=false
      }

    체스말.style.width=`55px`
    체스말.style.height=`55px`
    체스말.style.marginBottom='-4px'
    체스말.addEventListener('dragend',드래그엔드)
    }
  }
}
function scroll_down(){
  var divdiv=document.getElementById('chat');
  var 입력창=document.getElementById('test');
  입력창.focus()
 
  divdiv.scrollTop=divdiv.scrollHeight
  
}
function 기보scroll_down(){
  var divdiv=document.getElementById('기보');
 
  divdiv.scrollTop=divdiv.scrollHeight
  
}
function send() { //메시지 보내기 함수
  // 입력되어있는 데이터 가져오기
  var message = document.getElementById('test').value
  
  // 가져왔으니 데이터 빈칸으로 변경
  document.getElementById('test').value = ''

  // 내가 전송할 메시지 클라이언트에게 표시
  var chat = document.getElementById('chat')
  var msg = document.createElement('div')
  var node = document.createTextNode(message)
  msg.classList.add('me')
  msg.appendChild(node)
  chat.appendChild(msg)

  // 서버로 message 이벤트 전달 + 데이터와 함께
  socket.emit('message', {type: 'message', message: message})

  scroll_down()
}
function 나의색x(x){
  if(내색깔()==='하양'){
    return 흰색기준x[x]
  }else{
    return 검정색기준x[x]
  }
}
function 나의색y(y){
  if(내색깔()==='하양'){
    return 흰색기준y[y]
  }else{
    return 검정색기준y[y]
  }
}
var 흰색기준x=['8','7','6','5','4','3','2','1']
var 흰색기준y=['a','b','c','d','e','f','g','h']
var 검정색기준x=['1','2','3','4','5','6','7','8']
var 검정색기준y=['h','g','f','e','d','c','b','a']
function 기보만들기(nx,ny,이동한말,tx,ty,말겹치는지여부,이동으로잡은말,특수이동){
  console.log(nx,ny,이동한말,tx,ty,말겹치는지여부,이동으로잡은말,특수이동)
  var 기보=''

  if(이동한말==='킹'){
    기보='K'
  }else if(이동한말==='퀸'){
    기보='Q'
  }else if(이동한말==='룩'){
    기보='R'
  }else if(이동한말==='비숍'){
    기보='B'
  }else if(이동한말==='나이트'){
    기보='N'
  }else{
    기보=''
    오십수체크=0
  }



  if(말겹치는지여부===1){
    기보=기보.concat(나의색y(ny))
  }else if(말겹치는지여부===2){
    기보=기보.concat(나의색x(nx))
  }else if(말겹치는지여부===3){
    기보=기보.concat(나의색y(ny),나의색x(nx))
  }



  if(이동으로잡은말!==''){ //뭔가 잡음
    if(이동한말==='폰'){
      if(말겹치는지여부===0){
        기보=기보.concat(나의색y(ny),'x',나의색y(ty),나의색x(tx))
      }else{
        기보=기보.concat('x',나의색y(ty),나의색x(tx))
      }
    }else{
      기보=기보.concat('x',나의색y(ty),나의색x(tx))
    }
  }else if(특수이동===1){//앙파상
    if(말겹치는지여부===0){
      기보=기보.concat(나의색y(ny),'x',나의색y(ty),나의색x(tx))
    }

  }else{ //안잡음
    기보=기보.concat(나의색y(ty),나의색x(tx))
  }



  if(특수이동==6){
    기보=기보.concat('=Q')
  }else if(특수이동==7){
    기보=기보.concat('=R')
  }else if(특수이동==8){
    기보=기보.concat('=B')
  }else if(특수이동==9){
    기보=기보.concat('=N')
  }else if(특수이동==1){
    기보=기보.concat(' e.p.')
  }



  if(특수이동>=2&&특수이동<=5){
    if(특수이동%2===0){
      기보='O-O'
    }else{
      기보='O-O-O'
    }
  }



  if(내색깔()=='하양'){
    기보='.'.concat(String(기보))
  }else{
    기보='...'.concat(String(기보))
  }


  return 기보
}


var 기보개수=0
var 최근기보



function 기보보내기(기보) { //기보 보내기 함수
  socket.emit('기보보내기', {type: '기보보내기', 기보: 기보})
}

var n턴전기보=['','','','','','','','','']


var 오십수체크=0

socket.on('기보보내기', function(data) { //기보를 같이 수신
  오십수체크++


  기보개수++ //기보개수=n이면, n번째 기보를 작성중
  기보완성본=`${data.기보}`

  for(var i=7;i>=0;i--){
    n턴전기보[i+1]=n턴전기보[i]
  }
  n턴전기보[0]=기보완성본


  if(기보개수%2===1){
    var message = String((기보개수+1)/2).concat(':',' ',기보완성본)

    var chat = document.getElementById('기보')

    var msg = document.createElement('div')

    var node = document.createTextNode(message)

    msg.classList.add('기보')
    msg.appendChild(node)
    chat.appendChild(msg)
    기보scroll_down()  
  }else{
    var t=String(최근기보.textContent)
    t=t.concat('/',기보완성본)
    최근기보.textContent=t
    기보scroll_down()


  }
  최근기보=msg


})








/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////






socket.on('gameend', function(data) { 

  if(게임중==0){
    return 0
  }

  var 승자=`${data.승자}`
  var 종료=`${data.정산결과}`
  console.log('정산 시작',승자,종료)
  var chat = document.getElementById('기보')
  while(chat.hasChildNodes()){
   chat.removeChild(chat.firstChild)
  }
 
  var 체크메이트=document.getElementById('101')
  var 시간초과=document.getElementById('102')
  var 기권=document.getElementById('103')
  var 접속종료=document.getElementById('104')
  var 스테일메이트=document.getElementById('105')
  var 무승부합의=document.getElementById('106')
  var 기물부족=document.getElementById('107')
  var 동형반복=document.getElementById('108')
  var 오십수=document.getElementById('109')
  var 기물부족및시간초과=document.getElementById('110')
  var 승리=document.getElementById('결과문구1')
  var 패배=document.getElementById('결과문구2')
  var 무승부=document.getElementById('결과문구3')
  var 백승리=document.getElementById('결과문구4')
  var 흑승리=document.getElementById('결과문구5')
  var chat = document.getElementById('기보')

  var 하양킹이미지=document.getElementById('하양킹')
  하양킹이미지.style.visibility='hidden'
  var 검정킹이미지=document.getElementById('검정킹')
  검정킹이미지.style.visibility='hidden'
  var 타이머=document.getElementById('timer')
  타이머.style.visibility='hidden'


  



  if(입장코드!==0&&내색깔()===승자){
    console.log('승')
    
    승리.style.visibility='visible'
    var 효과음1=document.createElement('audio')
      효과음1.src='/sound2'
      효과음1.play()
  }else if(승자==0){
    console.log('무')
    
    무승부.style.visibility='visible'
    var 효과음1=document.createElement('audio')
      효과음1.src='/sound7'
      효과음1.play()
  }else if(입장코드!==0&&내색깔()!==승자&&승자!=0){
    console.log('패')
    
    패배.style.visibility='visible'
    var 효과음1=document.createElement('audio')
      효과음1.src='/sound7'
      효과음1.play()
  }else if(입장코드===0){
    console.log('관전')
    if(승자==='하양'){
      
      백승리.style.visibility='visible'
    }else{
      
      흑승리.style.visibility='visible'
    }
    var 효과음1=document.createElement('audio')
      효과음1.src='/sound7'
      효과음1.play()
  }

  내턴=0
  체스판채우기()
  입장코드=0 
  게임중=0                         
  참가인원=-1
  p1아이디=''
  p2아이디=''                                             
  상대소켓아이디=''                        
                           
  선공=0                             
  
  정산결과=-1
  기보개수=0
  최근기보=''
  죽은검정폰=0
  죽은검정나이트=0
  죽은검정비숍=0
  죽은검정룩=0
  죽은검정퀸=0
  죽은하양폰=0
  죽은하양나이트=0
  죽은하양비숍=0
  죽은하양룩=0
  죽은하양퀸=0
  time=180

  제한시간=-1
  
  킹움직인적없음=1
  왼쪽룩움직인적없음=1
  오른쪽룩움직인적없음=1
  상대가전턴에y열폰을두칸움직임=-1
  내가방금y열폰을두칸움직임=-1
  무승부합의가능=0  
  오십수체크=0

  var 프로모션선택창=document.getElementById('promo')
  console.log('프로모션선택창:',프로모션선택창)
  프로모션선택창.style.display='none'

  n턴전기보=['','','','','','','','','']

  clearInterval(timer)


  var 무승부신청=document.getElementById('무승부클릭')
  var 무승부거절=document.getElementById('무승부거절')
  var 기권=document.getElementById('기권')
  무승부신청.style.visibility='hidden'
  무승부거절.style.visibility='hidden'
  기권.style.visibility='hidden'   
  var 종료이유=document.getElementById(String(종료))
  종료이유.style.visibility='visible'
  var 남은시간=document.getElementById('111')
  남은시간.style.visibility='visible'
  남은시간.textContent='10초 후에 종료됩니다.'

  
    


    setTimeout(function(){
      남은시간.textContent='9초 후에 종료됩니다.'
      setTimeout(function(){
        남은시간.textContent='8초 후에 종료됩니다.'
        setTimeout(function(){
          남은시간.textContent='7초 후에 종료됩니다.'
          setTimeout(function(){
            남은시간.textContent='6초 후에 종료됩니다.'
            setTimeout(function(){
              남은시간.textContent='5초 후에 종료됩니다.'
              setTimeout(function(){
                남은시간.textContent='4초 후에 종료됩니다.'
                setTimeout(function(){
                  남은시간.textContent='3초 후에 종료됩니다.'
                  setTimeout(function(){
                    남은시간.textContent='2초 후에 종료됩니다.'
                    setTimeout(function(){
                      남은시간.textContent='1초 후에 종료됩니다.'
                      setTimeout(function(){
                        
                        
                        var 참가버튼=document.getElementById('ready')
                        참가버튼.style.visibility='visible'
                        var 취소버튼=document.getElementById('quit')
                        취소버튼.style.visibility='hidden' 

                        var chat = document.getElementById('chat')
                        var message = document.createElement('div')
                        if(승자==='하양'){
                          if(선턴정하기신호===1){
                            var node = document.createTextNode(p1+`의 승리로 경기를 종료합니다.`)
                          }else{
                            var node = document.createTextNode(p2+`의 승리로 경기를 종료합니다.`)
                          }
                        }else if(승자==='검정'){
                          if(선턴정하기신호===1){
                            var node = document.createTextNode(p2+`의 승리로 경기를 종료합니다.`)
                          }else{
                            var node = document.createTextNode(p1+`의 승리로 경기를 종료합니다.`)
                          }
                        }else{
                          var node = document.createTextNode(`무승부로 경기를 종료합니다.`)
                        }
                        var className = 'notice'
                        message.classList.add(className)
                        message.appendChild(node)
                        chat.appendChild(message)
                        scroll_down()   
                        선턴정하기신호=0   
                        p1=''
                        p2=''

                        var 상대1=document.getElementById('상대1')
                        var 상대2=document.getElementById('상대2')
                        상대1.textContent='(대기중)'
                        상대2.textContent='(대기중)' 
                        무승부.style.visibility='hidden'
                        패배.style.visibility='hidden'
                        승리.style.visibility='hidden'
                        백승리.style.visibility='hidden'
                        흑승리.style.visibility='hidden'
                        종료이유.style.visibility='hidden'
                        남은시간.style.visibility='hidden'
                        var 무승부신청=document.getElementById('무승부클릭')
                        var 무승부거절=document.getElementById('무승부거절')
                        무승부신청.textContent='무승부 신청'
                        var 기권=document.getElementById('기권')
                        무승부신청.style.visibility='hidden'
                        무승부거절.style.visibility='hidden'
                        기권.style.visibility='hidden'  
                        for(var i=0;i<8;i++){
                          for(var j=0;j<8;j++){
                            체스판[i][j]=''
                            체스판말의색[i][j]=''
                          }
                        }
                        var chat = document.getElementById('기보')
                        while(chat.hasChildNodes()){
                            chat.removeChild(chat.firstChild)
                        }
                        for(var i=0;i<8;i++){
                          for(var j=0;j<8;j++){
                            var 그칸아이디=String(i*10+j)
                            var 그칸=document.getElementById(그칸아이디)
                            while(그칸.hasChildNodes()){
                              그칸.removeChild(그칸.firstChild)
                            }
                          }
                        }
                        for(var i=0;i<8;i++){
                          for(var j=0;j<8;j++){
                            var 그칸아이디0=String((7-i)*10+(7-j))
                            var 그칸0=document.getElementById(그칸아이디0)
                            if((i+j)%2===0){
                              그칸0.style.backgroundColor='rgb(254,206,160)'
                            }else{
                              그칸0.style.backgroundColor='rgb(211,138,69)'
                            }
                          }
                        }
                        for(var i=1;i<=15;i++){
                          var 그칸=document.getElementById(String(i+200))
                          while(그칸.hasChildNodes()){
                            그칸.removeChild(그칸.firstChild)
                          }
                        }
                        for(var i=1;i<=15;i++){
                          var 그칸=document.getElementById(String(i+300))
                          while(그칸.hasChildNodes()){
                            그칸.removeChild(그칸.firstChild)
                          }
                        }
                        socket.emit('realgameend', {type: 'real`gameend`'})
                        /////////////////
                        ///////////////
                        ///////////////
                        return 0

                      }, 1000)
                    }, 1000)
                  }, 1000)
                }, 1000)
              }, 1000)
            }, 1000)
          }, 1000)
        }, 1000)
      }, 1000)
    }, 1000)
    


})



function 게임종료(a){
  socket.emit('gameend', {type: 'gameend',승자:a,정산결과:정산결과})
}

function 참가버튼클릭(){
  socket.emit('readybutton', {type: 'readybutton'})
}
function 취소버튼클릭(){
  socket.emit('quitbutton', {type: 'quitbutton'})
}
socket.on('invite1', function(data) { //두명이 참가를 눌러서 게임에 초대됨
  입장코드=1 
  console.log('게임에 초대받았습니다. 입장코드=',입장코드)
})
socket.on('invite2', function(data) { //두명이 참가를 눌러서 게임에 초대됨
  입장코드=2
  console.log('게임에 초대받았습니다. 입장코드=',입장코드)
})

socket.on('checkgame', function(data) { //참가나 취소를 누를때마다 서버정보를 받아옴
  var 효과음1=document.createElement('audio')
  효과음1.src='/sound1'
  효과음1.play()

  참가인원=Number(`${data.참가인원}`)
  console.log('서버로부터 게임시작할지 체크하라는 신호를 받음, 참가인원',참가인원)
  p1=`${data.p1}`
  p2=`${data.p2}`     //일단 서버의 p1과 p2를 가져옴
  p1아이디=`${data.p1아이디}`
  p2아이디=`${data.p2아이디}` 
  console.log('p1닉',p1)
  console.log('p1 id',p1아이디)
  console.log('p2닉',p2)
  console.log('p2 id',p2아이디)
  선턴정하기신호=Number(`${data.선턴정하기신호}`)

  var 상대1=document.getElementById('상대1')
  var 상대2=document.getElementById('상대2')

  if(p1===''){
    상대1.textContent='(대기중)'
  }else{
    상대1.textContent=p1
  }
  if(p2===''){
    상대2.textContent='(대기중)'
  }else{
    상대2.textContent=p2
  }

  if(참가인원===0){ //한명도 참가하지 않음
    console.log('참가인원 0, 모두에게 참가버튼만 활성화')
    var 참가버튼=document.getElementById('ready')
    참가버튼.style.visibility='visible'
    var 취소버튼=document.getElementById('quit')
    취소버튼.style.visibility='hidden' 
  }else if(참가인원===1){ //한명 참가
    if(p1아이디===내소켓아이디){
      console.log('참가인원 1, 나는 취소버튼만 활성화')
      var 참가버튼=document.getElementById('ready')
      참가버튼.style.visibility='hidden'
      var 취소버튼=document.getElementById('quit')
      취소버튼.style.visibility='visible' 
    }else{
      console.log('참가인원 1, 나는 참가버튼만 활성화')
      var 참가버튼=document.getElementById('ready')
      참가버튼.style.visibility='visible'
      var 취소버튼=document.getElementById('quit')
      취소버튼.style.visibility='hidden' 
    }
  }else if(p1!==''&&p2!==''){ //두명 참가 (게임시작)
    console.log('참가인원 2, 게임시작')
    var 참가버튼=document.getElementById('ready')
    참가버튼.style.visibility='hidden'
    var 취소버튼=document.getElementById('quit')
    취소버튼.style.visibility='hidden' 
    var chat = document.getElementById('chat')
    var message = document.createElement('div')
    var node = document.createTextNode(p1+`와 `+p2+`의 대결을 시작하겠습니다.`)
    var className = 'notice'
    message.classList.add(className)
    message.appendChild(node)
    chat.appendChild(message)
    scroll_down()   

    if(선턴정하기신호===입장코드){
      선공=1
    }else if(입장코드!==0){
      선공=0
    }else{
      선공=Math.floor(Math.random()*2)+1
    }
    
    if(선턴정하기신호===1){
      상대1.textContent=상대1.textContent+'(백)'
      상대2.textContent=상대2.textContent+'(흑)'
    }else{
      상대2.textContent=상대2.textContent+'(백)'
      상대1.textContent=상대1.textContent+'(흑)'
    }

    if(내소켓아이디===p1아이디){
      상대소켓아이디=p2아이디
    }else if(내소켓아이디===p2아이디){
      상대소켓아이디=p1아이디
    }

    if(선공===1){
      //선공이라면
      내턴=1
      기초세팅흰색편()
      체스판채우기()
      var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
    }else{
      //후공이라면
      내턴=0
      기초세팅검정색편()
      체스판채우기()
      var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
    }
    
    if(입장코드===0){
      내턴=-1
      console.log('관전자입니다.')
      if(선공===1){
        if(선턴정하기신호===1){
          var message = p1+'의 게임을 관전중입니다.'
        }else{
          var message = p2+'의 게임을 관전중입니다.'
        }
      }else{
        if(선턴정하기신호===2){
          var message = p1+'의 게임을 관전중입니다.'
        }else{
          var message = p2+'의 게임을 관전중입니다.'
        }
      }
      var chat = document.getElementById('chat')
      var msg = document.createElement('div')
      var node = document.createTextNode(message)
      msg.classList.add('me')
      msg.appendChild(node)
      chat.appendChild(msg)  
      scroll_down()  
      
      
    }
    if(입장코드!==0){
      var 무승부신청=document.getElementById('무승부클릭')
      var 무승부거절=document.getElementById('무승부거절')
      var 기권=document.getElementById('기권')
      무승부신청.style.visibility='visible'
      무승부거절.style.visibility='hidden'
      기권.style.visibility='visible'  
      }
    if(내소켓아이디===p1아이디){
      socket.emit('gamestart', {type: 'gamestart'})
    }
    
  }
  
})

socket.on('check', function(data) { //상대가 체크당했으면 보내는 신호를 수신

  var message = 'Check.'
  console.log('체크했습니다.')
  socket.emit('message', {type: 'message', message: message})
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode('Check.')
  var className = 'me' 
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)    
  scroll_down()  

})
socket.on('checkmate', function(data) { //상대가 체크메이트당했으면 보내는 신호를 수신

  console.log('체크메이트했습니다.')
  var 그칸아이디=String(상대방왕x()*10+상대방왕y())
  var 그칸=document.getElementById(그칸아이디)
  그칸.style.backgroundColor='rgb(167, 37, 37)'
  var message = 'Checkmate.'
  socket.emit('message', {type: 'message', message: message})
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode('Checkmate.')
  var className = 'me' 
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)    
  scroll_down()  

})
socket.on('stail', function(data) { //상대가 스테일메이트당했으면 보내는 신호를 수신
  
  console.log('스테일메이트했습니다.')
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`스테일메이트로 게임을 무승부로 종료합니다.`)
  var className = 'notice' 
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()  

})




socket.on('turnend', function(data) { //턴종료 신호를 받아 나의 턴이 시작됨
  console.log('내 턴 시작')
  var 일차기보=(`${data.일차기보}`)
  오십수체크=Number(`${data.오십수체크}`)


  if(공격당하는지확인(내왕x(),내왕y())){ //체크이면
    if(움직일수있는말이있는지확인()===0){ //체크메이트인지 확인
      console.log('체크메이트당했습니다.')
      var 그칸아이디=String(내왕x()*10+내왕y())
      var 그칸=document.getElementById(그칸아이디)
      그칸.style.backgroundColor='rgb(167, 37, 37)'  
      정산결과='101'
      일차기보=String(일차기보)+'#'
      기보보내기(일차기보)
      socket.emit('checkmate', {type: 'checkmate',상대소켓아이디:상대소켓아이디}) //내가 체크메이트를 당함
      게임종료(상대색깔())
      return 0
    }else{ //그냥 체크
      console.log('체크당했습니다.')
      일차기보=String(일차기보)+'+'
      socket.emit('check', {type: 'check',상대소켓아이디:상대소켓아이디}) //내가 체크를 당함
      var 효과음1=document.createElement('audio')
      효과음1.src='/sound5'
      효과음1.play()
    }
  }else if(움직일수있는말이있는지확인()===0){ //체크가 아닌데 움직일 말이 없으면..
    console.log('스테일메이트당했습니다.')
    정산결과='105'
    console.log('직전 상대의 최종 기보',일차기보)
    기보보내기(일차기보)
    socket.emit('stail', {type: 'stail',상대소켓아이디:상대소켓아이디}) //내가 스테일메이트를 당함
    게임종료(0)
    return 0
  } 

  if(기물체크()===-1){          //양측 기물부족
    정산결과='107'
    console.log('직전 상대의 최종 기보',일차기보)
    기보보내기(일차기보)
    게임종료(0)
    return 0
  }
  
  if(오십수체크>=99){
    정산결과='109'
    console.log('직전 상대의 최종 기보',일차기보)
    기보보내기(일차기보)
    게임종료(0)
    return 0
  }
  
  if(n턴전기보[0]===n턴전기보[4]&&n턴전기보[0]===n턴전기보[8]&&n턴전기보[1]===n턴전기보[5]&&n턴전기보[2]===n턴전기보[6]&&n턴전기보[3]===n턴전기보[7]){
    if(n턴전기보[0]!==''&&n턴전기보[1]!==''&&n턴전기보[2]!==''&&n턴전기보[3]!==''&&n턴전기보[4]!==''&&n턴전기보[5]!==''&&n턴전기보[6]!==''&&n턴전기보[7]!==''&&n턴전기보[8]!==''){
    정산결과='108'
    console.log('직전 상대의 최종 기보',일차기보)
    기보보내기(일차기보)
    게임종료(0)
    return 0
    }
  }

  console.log('직전 상대의 최종 기보',일차기보)
  기보보내기(일차기보)
  if(공격당하는지확인(내왕x(),내왕y())){
    var 효과음1=document.createElement('audio')
    console.log('sound5')
    효과음1.src='/sound5'
    효과음1.play()
  }else{
    console.log('sound6')
    var 효과음1=document.createElement('audio')
    효과음1.src='/sound6'
    효과음1.play()
  }
  
  내턴=1
  체스판채우기()

})

  var 하양나이트=0
  var 하양비숍=0
  var 하양폰룩퀸=0
  var 검정나이트=0
  var 검정비숍=0
  var 검정폰룩퀸=0
  var 하양비숍위치=0
  var 검정비숍위치=0

function 기물체크(){
하양나이트=0
하양비숍=0
하양폰룩퀸=0
검정나이트=0
검정비숍=0
검정폰룩퀸=0
하양비숍위치=0
검정비숍위치=0
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      if(체스판말의색[i][j]==='하양'){
        if(체스판[i][j]==='나이트'){
          하양나이트++
        }else if(체스판[i][j]==='비숍'){
          하양비숍++
          하양비숍위치=(i+j)%2
        }else if(체스판[i][j]!=='킹'){
          하양폰룩퀸++
        }
      }else if(체스판말의색[i][j]==='검정'){
        if(체스판[i][j]==='나이트'){
          검정나이트++
        }else if(체스판[i][j]==='비숍'){
          검정비숍++
          검정비숍위치=(i+j)%2
        }else if(체스판[i][j]!=='킹'){
          검정폰룩퀸++
        }
      }
    }
  }
  if(하양폰룩퀸===0&&검정폰룩퀸===0){ //무승부
    if(하양비숍===0&&하양나이트===0&&검정비숍===0&&검정나이트===0){ //킹대킹
      return -1
    }else if(하양비숍===0&&하양나이트===1&&검정비숍===0&&검정나이트===0){ //
      return -1
    }else if(하양비숍===1&&하양나이트===0&&검정비숍===0&&검정나이트===0){ //
      return -1
    }else if(하양비숍===0&&하양나이트===0&&검정비숍===1&&검정나이트===0){ //
      return -1
    }else if(하양비숍===0&&하양나이트===0&&검정비숍===0&&검정나이트===1){ //
      return -1
    }else if(하양비숍===1&&하양나이트===0&&검정비숍===1&&검정나이트===0){ //
      if(하양비숍위치==검정비숍위치){
        return -1
      }
    }
  }
  if(하양폰룩퀸===0){
    if((하양나이트===0&&하양비숍===0)||(하양나이트===1&&하양비숍===0)||(하양나이트===0&&하양비숍===1)){
      return -2
    }
  }
  if(검정폰룩퀸===0){
    if((검정나이트===0&&검정비숍===0)||(검정나이트===1&&검정비숍===0)||(검정나이트===0&&검정비숍===1)){
      return -3
    }
  }
  return 0
}






socket.on('movefinish', function(data) { //상대가 말을 움직이면 내 보드판에도 반영



  var nx=Number(`${data.nx}`)
  var ny=Number(`${data.ny}`)
  var tx=Number(`${data.tx}`)
  var ty=Number(`${data.ty}`)
  var 특수이동=Number(`${data.특수이동}`)
  var 상대색깔=(`${data.상대색깔}`)


  console.log('상대방의 움직임 신호',nx,ny,tx,ty,특수이동,상대색깔)


  if(상대색깔==내색깔()){
    console.log('상대의 이동을 반영하였음')

    적이방금폰두칸움직인열=Number(`${data.내가방금y열폰을두칸움직임}`)
    체스판[7-tx][7-ty]=체스판[7-nx][7-ny]
    체스판[7-nx][7-ny]=''
    체스판말의색[7-tx][7-ty]=체스판말의색[7-nx][7-ny]
    체스판말의색[7-nx][7-ny]=''
  
  
    for(var i=0;i<8;i++){
      for(var j=0;j<8;j++){
        var 그칸아이디0=String((7-i)*10+(7-j))
        var 그칸0=document.getElementById(그칸아이디0)
        if((i+j)%2===0){
          그칸0.style.backgroundColor='rgb(254,206,160)'
        }else{
          그칸0.style.backgroundColor='rgb(211,138,69)'
        }
      }
    }
    var 그칸아이디=String((7-nx)*10+(7-ny))
    var 그칸=document.getElementById(그칸아이디)
    if((nx+ny)%2===1){
      그칸.style.backgroundColor='rgb(211,168,69)'
    }else{
      그칸.style.backgroundColor='rgb(254,236,160)'
    }
    var 그칸아이디2=String((7-tx)*10+(7-ty))
    var 그칸2=document.getElementById(그칸아이디2)
    if((tx+ty)%2===1){
      그칸2.style.backgroundColor='rgb(211,168,69)'
    }else{
      그칸2.style.backgroundColor='rgb(254,236,160)'
    }
      
  
  
    if(특수이동===1){
      체스판[7-tx-1][7-ty]=''
      체스판말의색[7-tx-1][7-ty]=''
    }else if(특수이동>=2&&특수이동<=5){
      if(특수이동===2){
        체스판[0][2]=체스판[0][0]
        체스판[0][0]=''
        체스판말의색[0][2]=체스판말의색[0][0]
        체스판말의색[0][0]=''
      }else if(특수이동===3){
        체스판[0][4]=체스판[0][7]
        체스판[0][7]=''
        체스판말의색[0][4]=체스판말의색[0][7]
        체스판말의색[0][7]=''
      }else if(특수이동===4){
        체스판[0][5]=체스판[0][7]
        체스판[0][7]=''
        체스판말의색[0][5]=체스판말의색[0][7]
        체스판말의색[0][7]=''
      }else if(특수이동===5){
        체스판[0][3]=체스판[0][0]
        체스판[0][0]=''
        체스판말의색[0][3]=체스판말의색[0][0]
        체스판말의색[0][0]=''
      }
    }else if(특수이동>=6){
      if(특수이동===6){
        체스판[7-tx][7-ty]='퀸'
      }else if(특수이동===7){
        체스판[7-tx][7-ty]='룩'
      }else if(특수이동===8){
        체스판[7-tx][7-ty]='비숍'
      }else if(특수이동===9){
        체스판[7-tx][7-ty]='나이트'
      }
    }
  
  
    if(적이방금폰두칸움직인열===-1){
      상대가전턴에y열폰을두칸움직임=-1
    }else{
      상대가전턴에y열폰을두칸움직임=7-적이방금폰두칸움직인열
      console.log('상대가 직전에',상대가전턴에y열폰을두칸움직임,'열의 폰을 두칸 움직였습니다.')
    }



  }else{
  console.log('내가 관전중인 플레이어의 이동을 반영하였음')

  내가방금y열폰을두칸움직임=Number(`${data.내가방금y열폰을두칸움직임}`)
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''


  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그칸아이디0=String(i*10+j)
      var 그칸0=document.getElementById(그칸아이디0)
      if((i+j)%2===0){
        그칸0.style.backgroundColor='rgb(254,206,160)'
      }else{
        그칸0.style.backgroundColor='rgb(211,138,69)'
      }
    }
  }
  var 그칸아이디=String((nx)*10+(ny))
  var 그칸=document.getElementById(그칸아이디)
  if((nx+ny)%2===1){
    그칸.style.backgroundColor='rgb(211,168,69)'
  }else{
    그칸.style.backgroundColor='rgb(254,236,160)'
  }
  var 그칸아이디2=String((tx)*10+(ty))
  var 그칸2=document.getElementById(그칸아이디2)
  if((tx+ty)%2===1){
    그칸2.style.backgroundColor='rgb(211,168,69)'
  }else{
    그칸2.style.backgroundColor='rgb(254,236,160)'
  }
    


  if(특수이동===1){
    체스판[tx+1][ty]=''
    체스판말의색[tx+1][ty]=''
  }else if(특수이동>=2&&특수이동<=5){
    if(특수이동===2){
      체스판[7][5]=체스판[7][7]
      체스판[7][7]=''
      체스판말의색[7][5]=체스판말의색[7][7]
      체스판말의색[7][7]=''
    }else if(특수이동===3){
      체스판[7][3]=체스판[7][0]
      체스판[7][0]=''
      체스판말의색[7][3]=체스판말의색[7][0]
      체스판말의색[7][0]=''
    }else if(특수이동===4){
      체스판[7][2]=체스판[7][0]
      체스판[7][0]=''
      체스판말의색[7][2]=체스판말의색[7][0]
      체스판말의색[7][0]=''
    }else if(특수이동===5){
      체스판[7][4]=체스판[7][7]
      체스판[7][7]=''
      체스판말의색[7][4]=체스판말의색[7][7]
      체스판말의색[7][7]=''
    }
  }else if(특수이동>=6){
    if(특수이동===6){
      체스판[tx][ty]='퀸'
    }else if(특수이동===7){
      체스판[tx][ty]='룩'
    }else if(특수이동===8){
      체스판[tx][ty]='비숍'
    }else if(특수이동===9){
      체스판[tx][ty]='나이트'
    }
  }

  }
  체스판채우기()


  
})

socket.on('gamestart', function(data) {   
  게임중=1
  if(내턴===1){
    socket.emit('starttimer', {type: 'starttimer',색깔:'하양'})
  }
})



var time=180
var timer=null

socket.on('starttimer', function(data) {   

  clearInterval(timer)
  timer=null
  console.log('타이머 시작')
  색깔=(`${data.색깔}`)
  var 하양킹이미지=document.getElementById('하양킹')
  하양킹이미지.style.visibility='hidden'
  var 검정킹이미지=document.getElementById('검정킹')
  검정킹이미지.style.visibility='hidden'
  var 타이머=document.getElementById('timer')
  타이머.style.visibility='visible'
  타이머.style.visibility='visible'

  if(색깔==='하양'){
    하양킹이미지.style.visibility='visible'
  }else if(색깔==='검정'){
    검정킹이미지.style.visibility='visible'
  }
  
  
  time=180
  t=기보개수


  
  timer=setInterval(function(){
    time--
    var 타이머=document.getElementById('timer')
    타이머.textContent=String(Math.floor(time/60)).concat(':',min(time%60))
  
    if(time==30){
      var 효과음1=document.createElement('audio')
      효과음1.src='/sound3'
      효과음1.play()
    }

    if(time<=0){
      clearInterval(timer)
      console.log('타이머 중단, 시간다씀',time)

      if(내턴===1){
        if((기물체크()===-2&&내색깔()==='검정')||(기물체크()===-3&&내색깔()==='하양')){
          정산결과='110'
          게임종료(0)
        }else{
          정산결과='102'
          게임종료(상대색깔())
        }
      }
      
    }else if(t!==기보개수){
      clearInterval(timer)
      console.log('타이머 중단 턴종료')
      타이머.textContent='3:00'
      time=180
      if(내턴===1){
        socket.emit('starttimer', {type: 'starttimer',색깔:내색깔()})
      }
    }  
  },1000)
})


function min(a){
  if(a===0){
    return '00'
  }else if(a<10){
    return '0'.concat(String(a))
  }else{
    return String(time%60)
  }  
}

















var 그말이있는칸의아이디
var 집은말x좌표
var 집은말y좌표
var 집은말색깔
var 집은말종류
var 이동하려는칸의아이디
var 이동할x좌표
var 이동할y좌표
var 그곳의말색깔
var 그곳의말종류


var 말겹치는지여부 //기보확인용
var 이동한말
var 이동으로잡은말

function 이미지전달(종류,색깔){
  var a
  if(색깔==='검정'){
  a=1
  }else if(색깔==='하양'){
  a=7
  }
  if(종류==='비숍'){
    a+=0
  }else if(종류==='킹'){
    a+=1
  }else if(종류==='나이트'){
    a+=2
  }else if(종류==='폰'){
    a+=3
  }else if(종류==='퀸'){
    a+=4
  }else if(종류==='룩'){
    a+=5
  }
  var b='images'
  b=b.concat(String(a))
  return b
}
function 드래그엔드(e){
  e.target.style.opacity=1

  var section1s = document.getElementsByClassName("동그라미"); 
  var a=section1s.length
  var p=[]
  var s=[]
  for( var i = 0; i < a; i++ ){
    var section1 = section1s.item(i); 
    var par=section1.parentElement
    p[i]=par
    s[i]=section1
  }
  for( var i = 0; i < a; i++ ){
    p[i].removeChild(s[i])
  }



}


function 집음(e){
  if(내턴!==1){
    return 0
  }
  그말이있는칸의아이디=Number(e.target.parentElement.id)
  집은말x좌표=Math.floor(그말이있는칸의아이디/10)
  집은말y좌표=그말이있는칸의아이디%10
  집은말색깔=체스판말의색[집은말x좌표][집은말y좌표]
  집은말종류=체스판[집은말x좌표][집은말y좌표]
  e.target.style.opacity=0
  var 체스말=document.createElement('img')
  체스말.src=이미지전달(집은말종류,집은말색깔)
  체스말.alt='체스말'
  체스말.style.width='50px'
  체스말.style.height='50px'
  체스말.style.opacity=1
  e.dataTransfer.setDragImage(체스말,27.5,27.5); 

  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      if(이동가능여부확인(집은말x좌표,집은말y좌표,i,j)){
        if(이동가능여부확인(집은말x좌표,집은말y좌표,i,j)===4&&앙파상하는척하고체크당하는지확인(집은말x좌표,집은말y좌표,i,j)===0){
          var 그칸아이디=String(i*10+j)
          var 그칸=document.getElementById(그칸아이디)
          var 이미지=document.createElement('img')
          var a=73+(55*j)
          a=String(a).concat('px')
          
          이미지.src='images13'
          이미지.alt='이미지'
          이미지.classList.toggle('동그라미')
          이미지.style.width='55px'
          이미지.style.height='55px'
          이미지.style.opacity='0.4'
          이미지.style.position='absolute'
          이미지.style.left=String(a)
          이미지.draggable=false
          이미지.droppable=true
          이미지.addEventListener('dragover',function(e){
            e.preventDefault()
          })
          console.log('ddd',이미지.droppable)
          이미지.addEventListener('drop',드롭)
          그칸.appendChild(이미지)
        }else if(이동시킨척하고체크당하는지확인(집은말x좌표,집은말y좌표,i,j)===0){
          var 그칸아이디=String(i*10+j)
          var 그칸=document.getElementById(그칸아이디)
          var 이미지=document.createElement('img')
          var a=73+(55*j)
          a=String(a).concat('px')
          
          이미지.src='images13'
          이미지.alt='이미지'
          이미지.classList.toggle('동그라미')
          이미지.style.width='55px'
          이미지.style.height='55px'
          이미지.style.opacity='0.4'
          이미지.style.position='absolute'
          이미지.style.left=String(a)
          이미지.draggable=false
          이미지.droppable=true
          이미지.addEventListener('dragover',function(e){
            e.preventDefault()
          })
          console.log('ddd',이미지.droppable)
          이미지.addEventListener('drop',드롭)
          그칸.appendChild(이미지)  
        }
      }
    }
  }




}




function 드롭(e){
  if(내턴!==1){
    return 0
  }



  이동하려는칸의아이디=Number(e.target.parentElement.id)
  이동할x좌표=Math.floor(이동하려는칸의아이디/10)
  이동할y좌표=이동하려는칸의아이디%10
  그곳의말색깔=체스판말의색[이동할x좌표][이동할y좌표]
  그곳의말종류=체스판[이동할x좌표][이동할y좌표]
  e.preventDefault()
  console.log(집은말x좌표,집은말y좌표,집은말색깔,집은말종류,이동할x좌표,이동할y좌표,그곳의말색깔,그곳의말종류)
  이동(집은말x좌표,집은말y좌표,이동할x좌표,이동할y좌표)
}

function 이동(nx,ny,tx,ty){                      //nx,ny의 말을 tx,ty로 이동시킬수 있다면, 이동시킨다.

var 특수이동=0



var a=0
var b=0
이동한말=체스판[nx][ny] 

이동으로잡은말=체스판[tx][ty]

for(var i=0;i<8;i++){
  for(var j=0;j<8;j++){ //어떤 칸 i,j에
    if(체스판말의색[i][j]==내색깔()&&체스판[i][j]==체스판[nx][ny]){ //내 기물이 있고
      if(이동가능여부확인(i,j,tx,ty)===1&&이동시킨척하고체크당하는지확인(i,j,tx,ty)===0){ //그 기물이 tx,ty로 이동할 수 있으며
        if(!(i===nx&&j===ny)){ //nx,ny랑도 다른 칸이라면
          if(i===nx||j===ny){ //근데 또 하나는 겹친다면
            if(i===nx){
              a++   //x가 겹친다. 즉 y값을 표기해야한다.
            }
            if(j===ny){
              b++   //y가 겹친다. 즉 x값을 표기해야한다.
            }
          }
        }
      }
    }
  }
}
if(a>0&&b>0){
  말겹치는지여부=3 //xy 둘다 표기
}else if(a>0){
  말겹치는지여부=1 //y 표기
}else if(b>0){
  말겹치는지여부=2 //x 표기
}else{
  말겹치는지여부=0 //걱정ㄴ
}





//기본적으로 이동 자체가 가능한지 확인한다
if(이동가능여부확인(nx,ny,tx,ty)===1||이동가능여부확인(nx,ny,tx,ty)===5){
  if(이동시킨척하고체크당하는지확인(nx,ny,tx,ty)){
    console.log('이렇게 이동하면 체크당합니다.')
    var 그칸아이디=String(내왕x()*10+내왕y())
    var 그칸=document.getElementById(그칸아이디)
    그칸.style.backgroundColor='rgb(167, 37, 37)'
    setTimeout(function () {
      if((내왕x()+내왕y())%2===0){
        그칸.style.backgroundColor='rgb(254,206,160)'
      }else{
        그칸.style.backgroundColor='rgb(211,138,69)'
      }
    }, 700);
    return 0
  }else{
    
    if(체스판[nx][ny]==='킹'&&체스판말의색[nx][ny]===내색깔()&&킹움직인적없음===1){
      킹움직인적없음=0
      console.log('킹을 움직였습니다.', 킹움직인적없음)
    }else if(체스판[nx][ny]==='룩'&&체스판말의색[nx][ny]===내색깔()){
      if(왼쪽룩움직인적없음===1&&ny===0){
        왼쪽룩움직인적없음=0
        console.log('왼쪽룩을 움직였습니다.',왼쪽룩움직인적없음)
      }else if(오른쪽룩움직인적없음===1&&ny===7){
        오른쪽룩움직인적없음=0
        console.log('오른쪽룩을 움직였습니다.', 오른쪽룩움직인적없음)
      }
    }
    if(이동가능여부확인(nx,ny,tx,ty)===5){
      내가방금y열폰을두칸움직임=ny
    }else{
      내가방금y열폰을두칸움직임=-1
    }
    특수이동=0
    if(tx===0&체스판[nx][ny]==='폰'){  //프로모션
      temp=체스판[tx][ty]
      체스판[tx][ty]=체스판[nx][ny]
      체스판[nx][ny]=''
      체스판말의색[tx][ty]=체스판말의색[nx][ny]
      체스판말의색[nx][ny]='' 
      var 프로모션선택창=document.getElementById('promo')
      console.log('프로모션선택창:',프로모션선택창)
      프로모션선택창.style.display='block'
      내턴=3
      체스판채우기() 
      return 0
    }
    if(체스판말의색[tx][ty]===상대색깔()){
      적말잡았음(체스판[tx][ty],상대색깔())
    } 
    체스판[tx][ty]=체스판[nx][ny]
    체스판[nx][ny]=''
    체스판말의색[tx][ty]=체스판말의색[nx][ny]
    체스판말의색[nx][ny]=''
    var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()
  }
}else if(이동가능여부확인(nx,ny,tx,ty)===4){
  if(앙파상하는척하고체크당하는지확인(nx,ny,tx,ty)){
    console.log('이렇게 이동하면 체크당합니다.')
    var 그칸아이디=String(내왕x()*10+내왕y())
    var 그칸=document.getElementById(그칸아이디)
    그칸.style.backgroundColor='rgb(167, 37, 37)'
    setTimeout(function () {
      if((내왕x()+내왕y())%2===0){
        그칸.style.backgroundColor='rgb(254,206,160)'
      }else{
        그칸.style.backgroundColor='rgb(211,138,69)'
      }
    }, 700);
    return 0
  }else{
    적말잡았음('폰',상대색깔())
    내가방금y열폰을두칸움직임=-1
    특수이동=1
    체스판[tx][ty]=체스판[nx][ny]
    체스판[nx][ny]=''
    체스판말의색[tx][ty]=체스판말의색[nx][ny]
    체스판말의색[nx][ny]=''
    체스판[tx+1][ty]=''
    체스판말의색[tx+1][ty]=''    
    var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()  
  }
}else if(이동가능여부확인(nx,ny,tx,ty)===9){
  특수이동=이동가능여부확인(nx,ny,tx,ty)-7
  킹움직인적없음=0
  오른쪽룩움직인적없음=0
  내가방금y열폰을두칸움직임=-1
  체스판[7][5]=체스판[7][7]
  체스판[7][7]=''
  체스판말의색[7][5]=체스판말의색[7][7]
  체스판말의색[7][7]=''
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''  
  var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()
}else if(이동가능여부확인(nx,ny,tx,ty)===10){
  특수이동=이동가능여부확인(nx,ny,tx,ty)-7
  킹움직인적없음=0
  왼쪽룩움직인적없음=0
  내가방금y열폰을두칸움직임=-1
  체스판[7][3]=체스판[7][0]
  체스판[7][0]=''
  체스판말의색[7][3]=체스판말의색[7][0]
  체스판말의색[7][0]=''  
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''
  var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()
}else if(이동가능여부확인(nx,ny,tx,ty)===11){
  특수이동=이동가능여부확인(nx,ny,tx,ty)-7
  킹움직인적없음=0
  왼쪽룩움직인적없음=0
  내가방금y열폰을두칸움직임=-1
  체스판[7][2]=체스판[7][0]
  체스판[7][0]=''
  체스판말의색[7][2]=체스판말의색[7][0]
  체스판말의색[7][0]=''
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''
  var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()
}else if(이동가능여부확인(nx,ny,tx,ty)===12){
  특수이동=이동가능여부확인(nx,ny,tx,ty)-7
  킹움직인적없음=0
  오른쪽룩움직인적없음=0
  내가방금y열폰을두칸움직임=-1
  체스판[7][4]=체스판[7][7]
  체스판[7][7]=''
  체스판말의색[7][4]=체스판말의색[7][7]
  체스판말의색[7][7]=''
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''
  var 효과음1=document.createElement('audio')
    효과음1.src='/sound1'
    효과음1.play()
}else{
  console.log('이동 불가능')
  return 0
}

//이동은 완료
//상대 화면에도 이동까지 이루어지게 한다 
for(var i=0;i<8;i++){
  for(var j=0;j<8;j++){
    var 그칸아이디0=String((7-i)*10+(7-j))
    var 그칸0=document.getElementById(그칸아이디0)
    if((i+j)%2===0){
      그칸0.style.backgroundColor='rgb(254,206,160)'
    }else{
      그칸0.style.backgroundColor='rgb(211,138,69)'
    }
  }
}
var 그칸아이디=String(nx*10+ny)
var 그칸=document.getElementById(그칸아이디)
if((nx+ny)%2===1){
  그칸.style.backgroundColor='rgb(211,168,69)'
}else{
  그칸.style.backgroundColor='rgb(254,236,160)'
}
var 그칸아이디2=String(tx*10+ty)
var 그칸2=document.getElementById(그칸아이디2)
if((tx+ty)%2===1){
  그칸2.style.backgroundColor='rgb(211,168,69)'
}else{
  그칸2.style.backgroundColor='rgb(254,236,160)'
}


socket.emit('movefinish', {type: 'movefinish', nx: 집은말x좌표, ny: 집은말y좌표, tx: 이동할x좌표, ty: 이동할y좌표, 특수이동: 특수이동, 내가방금y열폰을두칸움직임: 내가방금y열폰을두칸움직임, 상대색깔: 상대색깔()})



var 일차기보=기보만들기(nx,ny,이동한말,tx,ty,말겹치는지여부,이동으로잡은말,특수이동)


//턴 넘기기
내턴=0
체스판채우기()
socket.emit('turnend', {type: 'turnend', 상대소켓아이디: 상대소켓아이디,일차기보: 일차기보, 오십수체크:오십수체크})

}

function 룩각(nx, ny, tx, ty){
  if(nx===tx){ //같은 세로줄에 있다면
    var y
    if(ny>ty){ //이동할 위치가 밑
      y=ty+1
      while(y<ny){
        if(체스판말의색[nx][y]!==''){ //사이의 방해물 체크
          return 0
        }
        y++
      }
    }else if(ny<ty){ //이동할 위치가 위
      y=ny+1
      while(y<ty){
        if(체스판말의색[nx][y]!==''){ //사이의 방해물 체크
          return 0
        }
        y++
      }
    }
    return 1
  }else if(ny===ty){ //같은 가로줄에 있다면
    var x
    if(nx>tx){ //이동할 위치가 왼쪽
      x=tx+1
      while(x<nx){
        if(체스판말의색[x][ny]!==''){ //사이에 방해물 체크
          return 0
        }
        x++
      }
    }else if(nx<tx){ //이동할 위치가 오른쪽
      x=nx+1
      while(x<tx){
        if(체스판말의색[x][ny]!==''){ //사이에 방해물 체크
          return 0
        }
        x++
      }
    }
    return 1
  }else{ //같은 줄에 없다면
    return 0
  }
}
function 비숍각(nx, ny, tx, ty){
  if(Math.abs(nx-tx)===Math.abs(ny-ty)){ //대각선 위치에 있다면

    if((nx-tx)*(ny-ty)>0){ //좌상단 우하단

      var x
      var y
      
      if(nx>tx){
        x=tx+1
        y=ty+1
        while(x<nx){
          if(체스판말의색[x][y]!==''){
            return 0
          }
          x++
          y++
        }
      }else{
        x=nx+1
        y=ny+1
        while(x<tx){
          if(체스판말의색[x][y]!==''){
            return 0
          }
          x++
          y++
        }
      }

      return 1


    }else{ //좌하단 우상단

      var x
      var y
      
      if(nx>tx){
        x=tx+1
        y=ty-1
        while(x<nx){
          if(체스판말의색[x][y]!==''){
            return 0
          }
          x++
          y--
        }
      }else{
        x=nx+1
        y=ny-1
        while(x<tx){
          if(체스판말의색[x][y]!==''){
            return 0
          }
          x++
          y--
        }
      }
      
      return 1

    }


  }else{ //대각선 위치가 아니라면
    return 0
  }
}
function 퀸각(nx, ny, tx, ty){
  if(룩각(nx, ny, tx, ty)||비숍각(nx, ny, tx, ty)){
    return 1
  }else{
    return 0
  }
}
function 나이트각(nx, ny, tx, ty){
  var x=Math.abs(nx-tx)
  var y=Math.abs(ny-ty)
  if(x+y===3&&x*y===2){
    return 1
  }else{
    return 0
  }
}
function 킹각(nx, ny, tx, ty){ //하양킹9 하양퀸10 검정킹11 검정퀸12
  if(Math.abs(nx-tx)<=1){
    if(Math.abs(ny-ty)<=1){
      return 1
    }
  }
  
  if((nx===7&&ny===4)&&(tx===7&&ty===6)){
    //킹사이드 캐슬링(하양)
    console.log('하양의 킹사이드 캐슬링')
    if(킹움직인적없음===1){
      console.log('1 ok')
      if(오른쪽룩움직인적없음===1){
        console.log('2 ok')
        if(체스판말의색[7][5]===''){
          if(체스판말의색[7][6]===''){
            console.log('3 ok')
            if(공격당하는지확인(7,4)===0){ //체크상태가 아니다
              console.log('4 ok')
              if(공격당하는지확인(7,5)===0){
                if(공격당하는지확인(7,6)===0){
                  console.log('5 ok')
                  return 9 //캐슬링 성공!
                }
              }
            }
          }
        }
      }
    }
    return 0
  }else if((nx===7&&ny===4)&&(tx===7&&ty===2)){
    //퀸사이드 캐슬링(하양)
    console.log('하양의 퀸사이드 캐슬링')
    if(킹움직인적없음===1){
      console.log('1 ok')
      if(왼쪽룩움직인적없음===1){
        console.log('2 ok')
        if(체스판말의색[7][3]===''){
          if(체스판말의색[7][2]===''){
            if(체스판말의색[7][1]===''){
              console.log('3 ok')
              if(공격당하는지확인(7,4)===0){ //체크상태가 아니다
                console.log('4 ok')
                if(공격당하는지확인(7,3)===0){
                  if(공격당하는지확인(7,2)===0){
                    console.log('5 ok')
                    return 10 //캐슬링 성공!
                  }
                }
              }
            }
          }
        }
      }
    }
    return 0
  }else if((nx===7&&ny===3)&&(tx===7&&ty===1)){
    //킹사이드 캐슬링(검정)
    console.log('검정의 킹사이드 캐슬링')
    if(킹움직인적없음===1){
      console.log('1 ok')
      if(왼쪽룩움직인적없음===1){
        console.log('2 ok')
        if(체스판말의색[7][2]===''){
          if(체스판말의색[7][1]===''){
            console.log('3 ok')
            if(공격당하는지확인(7,3)===0){ //체크상태가 아니다
              console.log('4 ok')
              if(공격당하는지확인(7,2)===0){
                if(공격당하는지확인(7,1)===0){
                  console.log('5 ok')
                  return 11 //캐슬링 성공!
                }
              }
            }
          }
        }
      }
    }
    return 0
  }else if((nx===7&&ny===3)&&(tx===7&&ty===5)){
    //퀸사이드 캐슬링(검정)
    console.log('검정의 퀸사이드 캐슬링')
    if(킹움직인적없음===1){
      console.log('1 ok')
      if(오른쪽룩움직인적없음===1){
        console.log('2 ok')
        if(체스판말의색[7][4]===''){
          if(체스판말의색[7][5]===''){
            if(체스판말의색[7][6]===''){
              console.log('3 ok')
              if(공격당하는지확인(7,3)===0){ //체크상태가 아니다
                console.log('4 ok')
                if(공격당하는지확인(7,4)===0){
                  if(공격당하는지확인(7,5)===0){
                    console.log('5 ok')
                    return 12 //캐슬링 성공!
                  }
                }
              }
            }
          }
        }
      }
    }
    return 0
  }else{
    return 0
  }  
}
function 폰각(nx, ny, tx, ty){ //한칸이동,두칸이동 5,잡기 1, 앙파상은 4
  if(체스판말의색[nx][ny]===내색깔()){

    if(tx===nx-1&&ty===ny&&체스판말의색[tx][ty]===''){ //한칸 위
      return 1
    }else if(tx===nx-2&&ty===ny&&체스판말의색[tx][ty]===''&&체스판말의색[tx+1][ty]===''&&nx===6){ //두칸 위
      return 5
    }else if(tx===nx-1&&Math.abs(ty-ny)===1&&체스판말의색[tx][ty]===상대색깔()){ //대각잡기
      return 1
    }else if(tx===nx-1&&Math.abs(ty-ny)===1&&체스판말의색[tx][ty]===''&&체스판말의색[tx+1][ty]===상대색깔()&&체스판[tx+1][ty]==='폰'&&상대가전턴에y열폰을두칸움직임===ty){ //앙파상
      return 4
    }else{
      return 0
    }




  }else if(체스판말의색[nx][ny]===상대색깔()){


    if(tx===nx+1&&ty===ny&&체스판말의색[tx][ty]===''){ //한칸 위
      return 1
    }else if(tx===nx+2&&ty===ny&&체스판말의색[tx][ty]===''&&체스판말의색[tx-1][ty]===''&&nx===1){ //두칸 위
      return 5
    }else if(tx===nx+1&&Math.abs(ty-ny)===1&&체스판말의색[tx][ty]===내색깔()){ //대각잡기
      return 1
    }else{
      return 0
    }




  }else{
    return 0
  }
}

function 내색깔(){
  if(선공===1){
    return '하양'
  }else{
    return '검정'
  }
}
function 상대색깔(){
  if(선공===1){
    return '검정'
  }else{
    return '하양'
  }
}
function 내왕x(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그말색=체스판말의색[i][j]
      var 그말종류=체스판[i][j]
      if(그말색===내색깔()){
        if(그말종류==='킹'){
          return i
        }
      }
    }
  }
}
function 내왕y(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그말색=체스판말의색[i][j]
      var 그말종류=체스판[i][j]
      if(그말색===내색깔()){
        if(그말종류==='킹'){
          return j
        }
      }
    }
  }
}
function 상대방왕x(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그말색=체스판말의색[i][j]
      var 그말종류=체스판[i][j]
      if(그말색===상대색깔()){
        if(그말종류==='킹'){
          return i
        }
      }
    }
  }
}
function 상대방왕y(){
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그말색=체스판말의색[i][j]
      var 그말종류=체스판[i][j]
      if(그말색===상대색깔()){
        if(그말종류==='킹'){
          return j
        }
      }
    }
  }
}

var 죽은하양폰=0     
var 죽은하양나이트=0
var 죽은하양비숍=0
var 죽은하양룩=0
var 죽은하양퀸=0

var 죽은검정폰=0   
var 죽은검정나이트=0
var 죽은검정비숍=0
var 죽은검정룩=0
var 죽은검정퀸=0



socket.on('kill', function(data) {   //상대가 말을 잡고 보내는 신호를 수신
  var 뒤진말=(`${data.잡은말종류}`)
  var 뒤진말색깔=(`${data.잡은말색깔}`)

  내말잡혔음(뒤진말)

  var a
  var b
  var c
  var d
  var e
  if(뒤진말색깔==='하양'){
    if(뒤진말==='폰'){
    죽은하양폰++
  }else if(뒤진말==='나이트'){
    죽은하양나이트++
  }else if(뒤진말==='비숍'){
    죽은하양비숍++
  }else if(뒤진말==='룩'){
    죽은하양룩++
  }else if(뒤진말==='퀸'){
    죽은하양퀸++
  }
  var 간격=200
  a=죽은하양폰
  b=죽은하양나이트
  c=죽은하양비숍
  d=죽은하양룩
  e=죽은하양퀸
  }else if(뒤진말색깔==='검정'){
    if(뒤진말==='폰'){
    죽은검정폰++
  }else if(뒤진말==='나이트'){
    죽은검정나이트++
  }else if(뒤진말==='비숍'){
    죽은검정비숍++
  }else if(뒤진말==='룩'){
    죽은검정룩++
  }else if(뒤진말==='퀸'){
    죽은검정퀸++
  }
  var 간격=300
  a=죽은검정폰
  b=죽은검정나이트
  c=죽은검정비숍
  d=죽은검정룩
  e=죽은검정퀸
  }
  console.log('뒤진말색깔',뒤진말색깔,'간격',간격)
  for(var i=1;i<=15;i++){
    var 그칸=document.getElementById(String(i+간격))
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
  }
  var 그칸1=document.getElementById('201')
  if(그칸1.hasChildNodes()==0){
  var 이미지1=document.createElement('img')
  이미지1.src='images0'
  이미지1.alt='체스말'
  그칸1.appendChild(이미지1)  
  이미지1.style.width='30px'
  이미지1.style.height='30px'
  이미지1.style.marginTop='-9px'
  이미지1.style.marginBottom='-9px'
  }
  var 그칸2=document.getElementById('301')
  if(그칸2.hasChildNodes()==0){
  var 이미지2=document.createElement('img')
  이미지2.src='images0'
  이미지2.alt='체스말'
  그칸2.appendChild(이미지2)
  이미지2.style.width='30px'
  이미지2.style.height='30px'
  이미지2.style.marginTop='-9px'
  이미지2.style.marginBottom='-9px'
  }

  for(var i=1;i<=a;i++){
    var 그칸=document.getElementById(String(i+간격))
    var 이미지=document.createElement('img')
    if(뒤진말색깔==='하양'){
      이미지.src='images10'
    }else{
      이미지.src='images4'
    }    
    이미지.alt='체스말'
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
    그칸.appendChild(이미지)
    이미지.style.width='30px'
    이미지.style.height='30px'
    이미지.style.marginTop='-9px'
    이미지.style.marginBottom='-9px'
  }
  for(var i=1+a;i<=a+b;i++){
    var 그칸=document.getElementById(String(i+간격))
    var 이미지=document.createElement('img')
    if(뒤진말색깔==='하양'){
      이미지.src='images9'
    }else{
      이미지.src='images3'
    }    
    이미지.alt='체스말'
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
    그칸.appendChild(이미지)
    이미지.style.width='30px'
    이미지.style.height='30px'
    이미지.style.marginTop='-9px'
    이미지.style.marginBottom='-9px'
  }
  for(var i=1+a+b;i<=a+b+c;i++){
    var 그칸=document.getElementById(String(i+간격))
    var 이미지=document.createElement('img')
    if(뒤진말색깔==='하양'){
      이미지.src='images7'
    }else{
      이미지.src='images1'
    }    
    이미지.alt='체스말'
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
    그칸.appendChild(이미지)
    이미지.style.width='30px'
    이미지.style.height='30px'
    이미지.style.marginTop='-9px'
    이미지.style.marginBottom='-9px'
  }
  for(var i=1+a+b+c;i<=a+b+c+d;i++){
    var 그칸=document.getElementById(String(i+간격))
    var 이미지=document.createElement('img')
    if(뒤진말색깔==='하양'){
      이미지.src='images12'
    }else{
      이미지.src='images6'
    }    
    이미지.alt='체스말'
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
    그칸.appendChild(이미지)
    이미지.style.width='30px'
    이미지.style.height='30px'
    이미지.style.marginTop='-9px'
    이미지.style.marginBottom='-9px'
  }
  for(var i=1+a+b+c+d;i<=a+b+c+d+e;i++){
    var 그칸=document.getElementById(String(i+간격))
    var 이미지=document.createElement('img')
    if(뒤진말색깔==='하양'){
      이미지.src='images11'
    }else{
      이미지.src='images5'
    }    
    이미지.alt='체스말'
    while(그칸.hasChildNodes()){
      그칸.removeChild(그칸.firstChild)
    }
    그칸.appendChild(이미지)
    이미지.style.width='30px'
    이미지.style.height='30px'
    이미지.style.marginTop='-9px'
    이미지.style.marginBottom='-9px'
  }

})



function 적말잡았음(잡은말,잡은말색깔){
  오십수체크=0
  socket.emit('kill', {type: 'kill', 잡은말종류: 잡은말, 잡은말색깔: 잡은말색깔})
}
function 내말잡혔음(잡은말){
  오십수체크=0
}
function 공격당하는지확인(타겟x,타겟y){ //내가 공격받는 경우만 고려
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){

      var 그말색=체스판말의색[i][j]
      var 그말종류=체스판[i][j]

      if(그말색===상대색깔()){
        if(이동가능여부확인(i,j,타겟x,타겟y)){ //i,j의 상대말이 내 타겟을 공격할 수 있다면
          return 1
        }
      }
      
    }
  }
  return 0
}
function 이동시킨척하고체크당하는지확인(nx, ny, tx, ty){ //'무조건' 이동시킨 뒤 확인함
  var 체크당함

  var 거기있던말=체스판[tx][ty]
  var 거기있던말색=체스판말의색[tx][ty]

  //일단 이동을 시켜본다
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''

  //이동시켰을때 내 왕이 체크당하는가?
  if(공격당하는지확인(내왕x(),내왕y())){ //체크당했다면
    체크당함=1
  }else{
    체크당함=0
  }
  
  //원상복구
  체스판[nx][ny]=체스판[tx][ty]
  체스판[tx][ty]=거기있던말
  체스판말의색[nx][ny]=체스판말의색[tx][ty]
  체스판말의색[tx][ty]=거기있던말색

  return 체크당함

}
function 앙파상하는척하고체크당하는지확인(nx, ny, tx, ty){
  var 체크당함

  var 거기있던말=체스판[tx][ty]
  var 거기있던말색=체스판말의색[tx][ty]

  //일단 이동을 시켜본다
  체스판[tx][ty]=체스판[nx][ny]
  체스판[nx][ny]=''
  체스판말의색[tx][ty]=체스판말의색[nx][ny]
  체스판말의색[nx][ny]=''

  //앙파상 위치의 폰도 잡은셈치고 없애본다
  체스판[tx+1][ty]=''
  체스판말의색[tx+1][ty]=''  

  //이동시켰을때 내 왕이 체크당하는가?
  if(공격당하는지확인(내왕x(),내왕y())){ //체크당했다면
    체크당함=1
  }else{
    체크당함=0
  }
  
  //원상복구
  체스판[nx][ny]=체스판[tx][ty]
  체스판[tx][ty]=거기있던말
  체스판말의색[nx][ny]=체스판말의색[tx][ty]
  체스판말의색[tx][ty]=거기있던말색
  체스판[tx+1][ty]='폰'
  체스판말의색[tx+1][ty]=상대색깔()

  return 체크당함

}
function 이동가능여부확인(nx,ny,tx,ty){       //nx,ny의 말을 tx,ty로 이동시킬수 있다면, 1(4,9~12)을 리턴

  if(체스판말의색[tx][ty]===체스판말의색[nx][ny]||(nx===tx&&ny===ty)||체스판말의색[nx][ny]===''){
    return 0
  }

  //기본적으로 이동 자체가 가능한지 확인한다
  if(체스판[nx][ny]==='룩'){
    return 룩각(nx, ny, tx, ty)
  }else if(체스판[nx][ny]==='비숍'){
    return 비숍각(nx, ny, tx, ty)
  }else if(체스판[nx][ny]==='퀸'){
    return 퀸각(nx, ny, tx, ty)
  }else if(체스판[nx][ny]==='킹'){
    return 킹각(nx, ny, tx, ty)
  }else if(체스판[nx][ny]==='나이트'){
    return 나이트각(nx, ny, tx, ty)
  }else if(체스판[nx][ny]==='폰'){
    return 폰각(nx, ny, tx, ty)
  }else{
    return 0
  }

}
function 움직일수있는말이있는지확인(){ //지금 상황에서 어떤 말을 이동시킬 수 있는지 확인
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){

      if(체스판말의색[i][j]===내색깔()){

        for(var p=0;p<8;p++){
          for(var q=0;q<8;q++){
            if(이동가능여부확인(i,j,p,q)===1||이동가능여부확인(i,j,p,q)>=9){
              if(이동시킨척하고체크당하는지확인(i,j,p,q)===0){
                return 1
              }
            }else if(이동가능여부확인(i,j,p,q)===4){
              if(앙파상하는척하고체크당하는지확인(i,j,p,q)===0){
                return 1
              }
            }else{
              //이동이 불가능하다.
            }
          }
        }

      }

    }
  }
  return 0
}
function 프로모션버튼클릭1(){
  var 프로모션선택창=document.getElementById('promo')
  console.log('프로모션선택창:',프로모션선택창)
  프로모션선택창.style.display='none'
  프로모션버튼결정완료(1)
}
function 프로모션버튼클릭2(){
  var 프로모션선택창=document.getElementById('promo')
  console.log('프로모션선택창:',프로모션선택창)
  프로모션선택창.style.display='none'
  프로모션버튼결정완료(2)
}
function 프로모션버튼클릭3(){
  var 프로모션선택창=document.getElementById('promo')
  console.log('프로모션선택창:',프로모션선택창)
  프로모션선택창.style.display='none'
  프로모션버튼결정완료(3)
}
function 프로모션버튼클릭4(){
  var 프로모션선택창=document.getElementById('promo')
  console.log('프로모션선택창:',프로모션선택창)
  프로모션선택창.style.display='none'
  프로모션버튼결정완료(4)
}
function 프로모션버튼결정완료(a){
  if(a===1){
    체스판[이동할x좌표][이동할y좌표]='퀸'
  }else if(a===2){
    체스판[이동할x좌표][이동할y좌표]='룩'
  }
  else if(a===3){
    체스판[이동할x좌표][이동할y좌표]='비숍'
  }
  else if(a===4){
    체스판[이동할x좌표][이동할y좌표]='나이트'
  }
  var 효과음1=document.createElement('audio')
  효과음1.src='/sound1'
  효과음1.play()
  for(var i=0;i<8;i++){
    for(var j=0;j<8;j++){
      var 그칸아이디0=String((7-i)*10+(7-j))
      var 그칸0=document.getElementById(그칸아이디0)
      if((i+j)%2===0){
        그칸0.style.backgroundColor='rgb(254,206,160)'
      }else{
        그칸0.style.backgroundColor='rgb(211,138,69)'
      }
    }
  }
  var 그칸아이디=String(집은말x좌표*10+집은말y좌표)
  var 그칸=document.getElementById(그칸아이디)
  if((집은말x좌표+집은말y좌표)%2===1){
    그칸.style.backgroundColor='rgb(211,168,69)'
  }else{
    그칸.style.backgroundColor='rgb(254,236,160)'
  }
  var 그칸아이디2=String(이동할x좌표*10+이동할y좌표)
  var 그칸2=document.getElementById(그칸아이디2)
  if((이동할x좌표+이동할y좌표)%2===1){
    그칸2.style.backgroundColor='rgb(211,168,69)'
  }else{
    그칸2.style.backgroundColor='rgb(254,236,160)'
  }  
  var 특수이동=a+5

  

  socket.emit('movefinish', {type: 'movefinish', nx: 집은말x좌표, ny: 집은말y좌표, tx: 이동할x좌표, ty: 이동할y좌표, 특수이동: 특수이동, 내가방금y열폰을두칸움직임: -1, 상대색깔:상대색깔()})
  if(temp!==''){
    적말잡았음(temp)
  } 


  console.log(집은말x좌표,집은말y좌표,이동한말,이동할x좌표,이동할y좌표,말겹치는지여부,이동으로잡은말,특수이동)
  var 일차기보=기보만들기(집은말x좌표,집은말y좌표,이동한말,이동할x좌표,이동할y좌표,말겹치는지여부,이동으로잡은말,특수이동)


  //턴 넘기기
  내턴=0
  체스판채우기()
  socket.emit('turnend', {type: 'turnend', 상대소켓아이디: 상대소켓아이디,일차기보: 일차기보}) 
}
var 무승부합의가능=0
function 무승부클릭(){
  if(무승부합의가능===1){
    정산결과='106'
    게임종료(0)
    return 0
  }
  socket.emit('draw', {type: 'draw',상대소켓아이디:상대소켓아이디})
  var 무승부신청=document.getElementById('무승부클릭')
  무승부신청.style.visibility='hidden'
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`무승부 요청을 보냈습니다.`)
  var className = 'notice'
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()     
  var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
}
socket.on('drawgomin', function(data) {   
  무승부합의가능=1
  var 무승부거절=document.getElementById('무승부거절')
  무승부거절.style.visibility='visible'
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`무승부 요청을 받았습니다. 수락하거나 거절할 수 있습니다.`)

  var 무승부신청=document.getElementById('무승부클릭')
  무승부신청.textContent='무승부 합의'

  var className = 'notice'
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()   
  var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
})
function 무승부거절(){
  무승부합의가능=0
  socket.emit('drawno', {type: 'drawno',상대소켓아이디:상대소켓아이디})
  var 무승부거절=document.getElementById('무승부거절')
  무승부거절.style.visibility='hidden' 
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`무승부를 거절했습니다.`)
  var 무승부신청=document.getElementById('무승부클릭')
  무승부신청.textContent='무승부 신청'
  var className = 'disconnect'
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()  
  var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
}
socket.on('drawnogomin', function(data) {   
  무승부합의가능=0
  var 무승부신청=document.getElementById('무승부클릭')
  무승부신청.style.visibility='visible'
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`무승부 요청이 거절되었습니다.`)
  var className = 'disconnect'
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()   
  var 효과음1=document.createElement('audio')
      효과음1.src='/sound4'
      효과음1.play()
})
function 기권(){
  정산결과='103'
  var 기권=document.getElementById('기권')
  기권.style.visibility='hidden'
  게임종료(상대색깔())
  
}



socket.on('connect', function(data) { //처음 접속하면 실행
  /* 이름을 입력받고 */
  내소켓아이디=socket.id
  socket.emit('isitstart', {type: 'isitstart', 내소켓아이디: 내소켓아이디})
  if(게임중==0){
    var 참가버튼=document.getElementById('ready')
    참가버튼.style.visibility='visible'
    var 취소버튼=document.getElementById('quit')
    취소버튼.style.visibility='hidden'
    상대1.textContent=p1
  }
  

  var name = prompt('사용할 닉네임을 입력해주세요.', '')
  내닉네임=name
  
  /* 이름이 빈칸인 경우 */
  if(!name) {
    name = '익명'+String(Math.floor((Math.random())*9000+1000))
  }
  /* 서버에 새로운 유저가 왔다고 알림 */
  socket.emit('newUser', name)
})

socket.on('update', function(data) { //서버가 업데이트 타입 데이터를 보내면 수신
  var chat = document.getElementById('chat')
  var message = document.createElement('div')
  var node = document.createTextNode(`${data.name}: ${data.message}`)
  var className = ''  

  


  접속인원=Number(`${data.people}`)
  참가인원=Number(`${data.참가인원}`)
  

  // 타입에 따라 적용할 클래스를 다르게 지정
  switch(data.type) {
    case 'message':
      className = 'other'
      break

    case 'connect':
      className = 'connect'
      break

    case 'disconnect':
      className = 'disconnect'
      break


  }
  message.classList.add(className)
  message.appendChild(node)
  chat.appendChild(message)
  scroll_down()
})

socket.on('isitstart', function(data) {   
  게임중=Number(`${data.게임중}`)
  p1=(`${data.p1}`)
  var 상대1=document.getElementById('상대1')

  if(p1===''){
    상대1.textContent='(대기중)'
  }else{
    상대1.textContent=p1
  }

  console.log('게임중=',게임중)
  if(게임중===1){
    alert('이미 게임이 진행중입니다...')
    var message = '연결이 종료되었습니다.'
    var chat = document.getElementById('chat')
    var msg = document.createElement('div')
    var node = document.createTextNode(message)
    msg.classList.add('disconnect')
    msg.appendChild(node)
    chat.appendChild(msg)  
    scroll_down()  
    socket.disconnect()
    return 0
  }
})

socket.on('탈주', function(data) {  
  var 탈주아이디=`${data.탈주아이디}`
  console.log(탈주아이디,'나감')
  정산결과='104'

  if(입장코드!==0){
    게임종료(내색깔())
  } 
    
})
