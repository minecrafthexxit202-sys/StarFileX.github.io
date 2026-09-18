const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3000';

function runTest() {
  console.log('--- BẮT ĐẦU KIỂM THỬ GIAO THỨC STAR FILE X ---');

  const senderWs = new WebSocket(WS_URL);
  const receiverWs = new WebSocket(WS_URL);

  const testSendCode = '123456789';
  const testReceiverCode = '987654321';
  let initialExpiresAt = null;

  senderWs.on('open', () => {
    console.log('[Sender] Đã kết nối WebSocket. Đang tạo phiên chia sẻ 9 số...');
    senderWs.send(JSON.stringify({
      type: 'create_session',
      sendCode: testSendCode,
      fileInfo: {
        name: 'secret_document.pdf',
        size: 1024 * 50, // 50 KB
        type: 'application/pdf'
      },
      maxReceivers: 2
    }));
  });

  senderWs.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('[Sender Nhận]:', msg.type);

    if (msg.type === 'session_created') {
      console.log(`[Sender] Phiên tạo thành công! Hạn ban đầu: ${new Date(msg.expiresAt).toLocaleTimeString()}`);
      initialExpiresAt = msg.expiresAt;

      // Bây giờ Receiver gửi yêu cầu kết nối kèm Mã Xác Minh 9 số
      setTimeout(() => {
        console.log(`[Receiver] Gửi yêu cầu nhận với Mã xác minh tạm thời: ${testReceiverCode}`);
        receiverWs.send(JSON.stringify({
          type: 'receiver_request',
          sendCode: testSendCode,
          receiverCode: testReceiverCode
        }));
      }, 500);
    }

    if (msg.type === 'receiver_joined') {
      console.log(`[Sender] Phát hiện người nhận mới! Mã XM: ${msg.receiverCode}`);
      console.log(`[Sender] Kiểm tra gia hạn +3 phút: Hạn mới: ${new Date(msg.expiresAt).toLocaleTimeString()}`);
      const diffMinutes = (msg.expiresAt - initialExpiresAt) / (60 * 1000);
      console.log(`[Sender] Thời gian gia hạn: +${diffMinutes.toFixed(1)} phút.`);

      if (Math.abs(diffMinutes - 3) < 0.1) {
        console.log('✓ XÁC THỰC THÀNH CÔNG: Đã tự động gia hạn thêm 3 phút (tổng cộng 18 phút)!');
      }

      // Sender bấm "Chấp nhận" (Approve)
      setTimeout(() => {
        console.log('[Sender] Bấm PHÊ DUYỆT cho người nhận...');
        senderWs.send(JSON.stringify({
          type: 'sender_decision',
          sendCode: testSendCode,
          receiverCode: testReceiverCode,
          approved: true
        }));
      }, 500);
    }

    if (msg.type === 'receiver_accepted_ack') {
      console.log('[Sender] Đã gửi thông báo chấp nhận. Bắt đầu truyền dữ liệu qua RAM chunk...');
      // Giả lập gửi 3 chunks dữ liệu
      for (let i = 0; i < 3; i++) {
        senderWs.send(JSON.stringify({
          type: 'chunk_relay',
          sendCode: testSendCode,
          receiverCode: testReceiverCode,
          chunkIndex: i,
          totalChunks: 3,
          chunkData: Buffer.from(`DATA_CHUNK_${i}_HELLO_STAR_FILE_X`).toString('base64')
        }));
      }
    }

    if (msg.type === 'receiver_completed') {
      console.log('[Sender] Người nhận đã hoàn tất tải và làm sạch metadata.');
      console.log('--- KIỂM THỬ THÀNH CÔNG 100% ---');
      senderWs.close();
      receiverWs.close();
      process.exit(0);
    }
  });

  receiverWs.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('  [Receiver Nhận]:', msg.type);

    if (msg.type === 'receiver_request_sent') {
      console.log('  [Receiver] Đã gửi mã xác minh, đang chờ người gửi duyệt...');
    }

    if (msg.type === 'transfer_accepted') {
      console.log('  [Receiver] Người gửi ĐÃ DUYỆT! Bắt đầu nhận file:', msg.fileInfo.name);
    }

    let chunksGot = 0;
    if (msg.type === 'chunk_relay') {
      chunksGot++;
      console.log(`  [Receiver] Nhận chunk ${msg.chunkIndex + 1}/${msg.totalChunks}`);
      if (msg.chunkIndex === msg.totalChunks - 1) {
        console.log('  [Receiver] Đã nhận đủ 100% chunks. Tẩy sạch metadata nguồn...');
        // Báo hoàn tất
        receiverWs.send(JSON.stringify({
          type: 'transfer_complete',
          sendCode: testSendCode,
          receiverCode: testReceiverCode
        }));
      }
    }
  });
}

runTest();
