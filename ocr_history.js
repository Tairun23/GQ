document.addEventListener('DOMContentLoaded', function() {
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ocrDB', 1);
      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = e => resolve(e.target.result);
      request.onerror = e => reject(e.target.error);
    });
  }

  async function getAllResults() {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction('results', 'readonly');
      const store = tx.objectStore('results');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function showHistory() {
    const history = await getAllResults();
    const listDiv = document.getElementById('historyList');
    const downloadAllBtn = document.getElementById('downloadAllCsvBtn');
    const sendAllEmailBtn = document.getElementById('sendAllEmailBtn');
    if (!history.length) {
      listDiv.innerHTML = '<p style="text-align:center;color:#888;">저장된 데이터가 없습니다.</p>';
      if (downloadAllBtn) downloadAllBtn.style.display = 'none';
      if (sendAllEmailBtn) sendAllEmailBtn.style.display = 'none';
      return;
    }
    let html = `<table style="width:100%;font-size:14px;"><thead>
      <tr>
        <th>이름</th><th>핸드폰번호</th><th>메일주소</th><th>날짜</th><th>CSV 다운로드</th>
      </tr></thead><tbody>`;
    history.reverse().forEach(item => {
      html += `<tr>
        <td>${item.name}</td>
        <td>${item.phone}</td>
        <td>${item.email}</td>
        <td>${item.date ? new Date(item.date).toLocaleString() : ''}</td>
        <td>
          <a href="data:text/csv;charset=utf-8,${encodeURIComponent(item.csv)}"
             download="ocr_result_${item.name}_${item.phone}_${item.email}_${item.id}.csv"
             style="color:#007bff;text-decoration:underline;">다운로드</a>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
    if (downloadAllBtn) downloadAllBtn.style.display = 'inline-block';
    if (sendAllEmailBtn) sendAllEmailBtn.style.display = 'inline-block';
  }

  async function deleteAllResults() {
    const db = await openDB();
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').clear();
    await tx.complete;
    showHistory();
  }

  document.getElementById('deleteAllBtn').onclick = function() {
    if (confirm('정말 모든 OCR 데이터를 삭제하시겠습니까?')) {
      deleteAllResults();
    }
  };

  document.getElementById('downloadAllCsvBtn').onclick = async function(e) {
    e.preventDefault();
    const all = await getAllResults();
    if (!all.length) return;
    let maxCols = 0;
    all.forEach(item => {
      const lines = item.csv.split('\n');
      if (lines.length > 1) {
        const cols = lines[1].split(',').length - 4;
        if (cols > maxCols) maxCols = cols;
      }
    });
    const header = `이름,핸드폰번호,메일주소,저장날짜` + (maxCols > 0 ? ',' : '') + Array.from({length:maxCols},(_,i)=>`column_${i+1}`).join(',');
    let rows = [];
    all.forEach(item => {
      const lines = item.csv.split('\n').slice(1);
      lines.forEach(line => {
        let arr = line.split(',');
        while(arr.length < 4 + maxCols) arr.push('');
        rows.push(arr.join(','));
      });
    });
    const totalCsv = header + '\n' + rows.join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + totalCsv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,0)}${String(now.getDate()).padStart(2,0)}_${String(now.getHours()).padStart(2,0)}${String(now.getMinutes()).padStart(2,0)}${String(now.getSeconds()).padStart(2,0)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr_results_all_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  document.getElementById('sendAllEmailBtn').onclick = async function(e) {
    e.preventDefault();
    const all = await getAllResults();
    if (!all.length) return alert('저장된 데이터가 없습니다.');
    let maxCols = 0;
    all.forEach(item => {
      const lines = item.csv.split('\n');
      if (lines.length > 1) {
        const cols = lines[1].split(',').length - 4;
        if (cols > maxCols) maxCols = cols;
      }
    });
    const header = `이름,핸드폰번호,메일주소,저장날짜` + (maxCols > 0 ? ',' : '') + Array.from({length:maxCols},(_,i)=>`column_${i+1}`).join(',');
    let rows = [];
    all.forEach(item => {
      const lines = item.csv.split('\n').slice(1);
      lines.forEach(line => {
        let arr = line.split(',');
        while(arr.length < 4 + maxCols) arr.push('');
        rows.push(arr.join(','));
      });
    });
    const totalCsv = header + '\n' + rows.join('\n');
    // 타임스탬프 생성
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,0)}-${String(now.getDate()).padStart(2,0)} ${String(now.getHours()).padStart(2,0)}:${String(now.getMinutes()).padStart(2,0)}:${String(now.getSeconds()).padStart(2,0)}`;
    // 받는 이메일 입력 받기
    const toEmail = prompt('CSV 파일을 받을 이메일 주소를 입력하세요:');
    if (!toEmail || !/^\S+@\S+\.\S+$/.test(toEmail)) {
      alert('올바른 이메일 주소를 입력하세요.');
      return;
    }
    // CSV를 base64로 인코딩
    function toBase64(str) {
      return window.btoa(unescape(encodeURIComponent(str)));
    }
    const base64Csv = toBase64(totalCsv);
    // EmailJS 초기화 및 전송
    emailjs.init('WspJLucJxD4s_3qUh');
    emailjs.send('service_r3h0b89', 'template_6pe5712', {
      to_email: toEmail,
      message: `아래 첨부된 CSV 파일과 본문 내용을 확인해주세요.`,
      csv_data: totalCsv,
      timestamp: timestamp,
      attachments: [
        {
          name: `ocr_results_all_${timestamp.replace(/[-: ]/g,'')}.csv`,
          data: 'data:text/csv;base64,' + base64Csv
        }
      ]
    }).then(function(response) {
      alert('메일이 성공적으로 전송되었습니다.');
    }, function(error) {
      alert('메일 전송에 실패했습니다: ' + JSON.stringify(error));
    });
  };

  showHistory();
});
