document.addEventListener('DOMContentLoaded', function() {
  // DOM 캐싱
  const $ = id => document.getElementById(id);
  const nameInput = $("nameInput"),
        phoneInput = $("phoneInput"),
        emailInput = $("emailInput"),
        imageInput = $("imageInput"), imagePreview = $("imagePreview"),
        resultDiv = $("result"),
        downloadLink = $("downloadLink"), csvResultDiv = $("csvResult"),
        progressContainer = $("progressContainer"), progressBar = $("progressBar"),
        progressLabel = $("progressLabel"), privacyCheckbox = $("privacyCheckbox"),
        recognizeBtn = $("recognizeBtn"), resetBtn = $("resetBtn");
  const progressPercent = document.getElementById('progressPercent');

  // 미리보기
  imageInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return imagePreview.style.display = 'none';
    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  // 동의 체크박스에 따라 버튼 활성화
  privacyCheckbox.onchange = () => recognizeBtn.disabled = !privacyCheckbox.checked;

  // 초기화
  function resetUI() {
    nameInput.value = '';
    phoneInput.value = '';
    emailInput.value = '';
    imageInput.value = '';
    imagePreview.src = '#'; imagePreview.style.display = 'none';
    resultDiv.textContent = '';
    csvResultDiv.innerHTML = '';
    downloadLink.style.display = 'none';
    progressContainer.style.display = 'none';
    privacyCheckbox.checked = false;
    recognizeBtn.disabled = true;
    resultDiv.style.display = 'none';
    csvResultDiv.style.display = 'none';
  }
  resetBtn.onclick = resetUI;

  // IndexedDB 유틸리티
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

  async function saveToIndexedDB(data) {
    const db = await openDB();
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').add(data);
    return tx.complete;
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

  // OCR 결과 불러오기 및 화면에 표시
  async function showHistory() {
    const history = await getAllResults();
    const historyDiv = document.getElementById('csvHistory');
    const listDiv = document.getElementById('historyList');
    const downloadAllBtn = document.getElementById('downloadAllCsvBtn');
    if (!history.length) {
      historyDiv.style.display = 'none';
      if (downloadAllBtn) downloadAllBtn.style.display = 'none';
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
    historyDiv.style.display = 'block';
    if (downloadAllBtn) downloadAllBtn.style.display = 'inline-block';
  }

  // 텍스트 인식
  recognizeBtn.onclick = async () => {
    recognizeBtn.disabled = true;
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const file = imageInput.files[0];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^01[016789]-?\d{3,4}-?\d{4}$/;

    resultDiv.textContent = ''; csvResultDiv.innerHTML = '';
    downloadLink.style.display = "none";
    resultDiv.style.display = 'none';
    csvResultDiv.style.display = 'none';

    if (!name) return alert('이름을 입력해주세요.');
    if (!phone) return alert('핸드폰 번호를 입력해주세요.');
    if (!phoneRegex.test(phone)) return alert('올바른 핸드폰 번호 형식을 입력해주세요.');
    if (!email) return alert('메일 주소를 입력해주세요.');
    if (!emailRegex.test(email)) return alert('올바른 이메일 주소 형식을 입력해주세요.');
    if (!file) return alert('이미지 파일을 선택해주세요.');
    if (!privacyCheckbox.checked) return alert('개인정보 제공 동의가 필요합니다.');

    imagePreview.style.display = 'none';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%'; progressBar.textContent = '';
    progressPercent.textContent = '0%';
    try {
      const { data: { text } } = await Tesseract.recognize(
        file, 'kor+eng',
        { logger: m => {
          if (m.status === 'recognizing text') {
            const p = Math.floor(m.progress * 100);
            progressBar.style.width = p + '%';
            progressPercent.textContent = p + '%';
          }
        }}
      );
      // CSV 변환
      const now = new Date();
      const dateStr = now.toISOString();
      const lines = text.split('\n').filter(line => line.trim());
      const rows = lines.map(line => line.trim().split(/\s{2,}/));
      const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
      // 이름, 핸드폰, 메일, 날짜 헤더와 값 추가
      const header = `이름,핸드폰번호,메일주소,저장날짜` + (maxCols > 0 ? ',' : '') + Array.from({length:maxCols},(_,i)=>`column_${i+1}`).join(',');
      const userInfo = `"${name.replace(/"/g,'""')}","${phone.replace(/"/g,'""')}","${email.replace(/"/g,'""')}","${dateStr}"`;
      const csvRows = rows.map(row =>
        userInfo + (row.length ? ',' : '') +
        row.concat(Array(maxCols-row.length).fill('')).map(cell => `"${cell.replace(/"/g,'""')}"`).join(',')
      );
      const csvData = header+'\n'+csvRows.join('\n');

      // 다운로드 링크
      downloadLink.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvData);
      downloadLink.download = `ocr_result_${name}_${phone}_${email}_${Date.now()}.csv`;
      downloadLink.style.display = "inline-block";

      // IndexedDB에 저장
      await saveToIndexedDB({
        name, phone, email,
        text, csv: csvData,
        date: dateStr
      });
      // 저장 후 목록 갱신
      showHistory();

      // 인식 완료 후 얼럿 및 초기화
      alert('텍스트 인식이 완료되었습니다.');
      resetUI();
      recognizeBtn.disabled = false;

    } catch (e) {
      alert('텍스트 인식 실패: ' + e);
      recognizeBtn.disabled = false;
    } finally {
      progressContainer.style.display = 'none';
    }
  };

  // 다운로드 링크 클릭 시 전체 누적 CSV로 저장
  downloadLink.onclick = async function(e) {
    e.preventDefault();
    const all = await getAllResults();
    if (!all.length) return;
    let maxCols = 0;
    all.forEach(item => {
      const lines = item.csv.split('\n');
      if (lines.length > 1) {
        const cols = lines[1].split(',').length - 3;
        if (cols > maxCols) maxCols = cols;
      }
    });
    const header = `이름,핸드폰번호,메일주소` + (maxCols > 0 ? ',' : '') + Array.from({length:maxCols},(_,i)=>`column_${i+1}`).join(',');
    let rows = [];
    all.forEach(item => {
      const lines = item.csv.split('\n').slice(1);
      lines.forEach(line => {
        let arr = line.split(',');
        while(arr.length < 3 + maxCols) arr.push('');
        rows.push(arr.join(','));
      });
    });
    const totalCsv = header + '\n' + rows.join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + totalCsv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr_results_all.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // IndexedDB 전체 삭제 함수
  async function deleteAllResults() {
    const db = await openDB();
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').clear();
    await tx.complete;
    showHistory();
  }

  // 삭제 버튼 이벤트 등록
  document.getElementById('deleteAllBtn').onclick = function() {
    if (confirm('정말 모든 OCR 데이터를 삭제하시겠습니까?')) {
      deleteAllResults();
    }
  };

  // 페이지 진입 시 저장된 결과 목록 표시
  showHistory();

  // CSV 전체 저장 버튼(타임스탬프 포함) - 데이터 있을 때만 노출
  document.getElementById('downloadAllCsvBtn').onclick = async function(e) {
    e.preventDefault();
    const all = await getAllResults();
    if (!all.length) return;
    let maxCols = 0;
    all.forEach(item => {
      const lines = item.csv.split('\n');
      if (lines.length > 1) {
        const cols = lines[1].split(',').length - 4; // 이름,핸드폰,메일,날짜 제외
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

  // EmailJS 초기화
  emailjs.init('WspJLucJxD4s_3qUh');

  // CSV 메일로 보내기 버튼이 중복 생성되지 않도록 체크
  const downloadAllBtn = document.getElementById('downloadAllCsvBtn');
  if (downloadAllBtn && !document.getElementById('sendCsvMailBtn')) {
    const mailBtn = document.createElement('button');
    mailBtn.id = 'sendCsvMailBtn';
    mailBtn.textContent = 'CSV 메일로 보내기';
    mailBtn.style = 'width:100%;padding:12px 28px;background:#007bff;color:#fff;border-radius:6px;font-size:17px;font-weight:bold;border:none;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.07);margin-bottom:12px;';
    downloadAllBtn.style = 'width:100%;padding:12px 28px;background:#007bff;color:#fff;border-radius:6px;font-size:17px;font-weight:bold;border:none;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.07);margin-bottom:12px;';
    const btnWrapper = document.createElement('div');
    btnWrapper.style = 'width:100%;display:flex;flex-direction:column;gap:0;margin-top:40px;';
    downloadAllBtn.parentNode.replaceChild(btnWrapper, downloadAllBtn);
    btnWrapper.appendChild(downloadAllBtn);
    btnWrapper.appendChild(mailBtn);

    mailBtn.onclick = async function() {
      const all = await getAllResults();
      if (!all.length) return alert('보낼 데이터가 없습니다.');
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
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,0)}-${String(now.getDate()).padStart(2,0)} ${String(now.getHours()).padStart(2,0)}:${String(now.getMinutes()).padStart(2,0)}:${String(now.getSeconds()).padStart(2,0)}`;
      const toEmail = prompt('CSV 파일을 받을 이메일 주소를 입력하세요:');
      if (!toEmail) return;
      function toBase64(str) {
        return window.btoa(unescape(encodeURIComponent(str)));
      }
      const base64Csv = toBase64(totalCsv);
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
  }
});
