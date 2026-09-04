/**
 * FRONTEND CONTROLLER - ĐỒNG BỘ 2 CHIỀU VỚI GOOGLE SHEETS BACKEND
 */

let allRegistrations = [];

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#requestForm');
  const statusEl = document.querySelector('#status');
  const btnSubmit = document.querySelector('#btnSubmit');
  const btnRefresh = document.querySelector('#btnRefresh');
  const filterStatus = document.querySelector('#filterStatus');
  const filterCa = document.querySelector('#filterCa');
  const filterSearch = document.querySelector('#filterSearch');

  // 1. Kiểm tra cấu hình URL
  const scriptUrl = window.APP_CONFIG ? window.APP_CONFIG.appsScriptUrl : '';
  if (!scriptUrl || !scriptUrl.startsWith('https://script.google.com/')) {
    showStatus(statusEl, 'Chưa cấu hình URL Apps Script hợp lệ trong config.js', 'error');
    return;
  }

  // 2. Tải dữ liệu ban đầu
  loadData();

  // 3. Xử lý Gửi Đăng Ký (POST)
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);

    // Disable nút bấm và hiển thị trạng thái đang gửi
    btnSubmit.disabled = true;
    showStatus(statusEl, '⏳ Đang gửi đăng ký vào Google Sheets...', 'loading');

    try {
      // Gửi request POST tới Apps Script Web App
      // Lưu ý: Sử dụng no-cors hoặc text/plain JSON để tránh bị CORS preflight chặn trên Apps Script
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      showStatus(statusEl, '✅ Đã gửi đăng ký thành công vào Google Sheets!', 'success');
      form.reset();

      // Đợi 1.5s để Google Sheets cập nhật xong rồi tự động làm mới bảng danh sách
      setTimeout(() => {
        loadData();
      }, 1500);

    } catch (error) {
      console.error('Lỗi khi gửi dữ liệu:', error);
      showStatus(statusEl, `❌ Lỗi kết nối: ${error.message}`, 'error');
    } finally {
      btnSubmit.disabled = false;
    }
  });

  // 4. Nút Làm mới
  btnRefresh.addEventListener('click', () => {
    loadData();
  });

  // 5. Sự kiện lọc
  filterStatus.addEventListener('change', applyFilters);
  filterCa.addEventListener('change', applyFilters);
  filterSearch.addEventListener('input', applyFilters);

  // --- HÀM TẢI DỮ LIỆU (GET) ---
  async function loadData() {
    const tableBody = document.querySelector('#tableBody');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">⏳ Đang đồng bộ dữ liệu từ Google Sheets...</td></tr>';
    btnRefresh.disabled = true;

    try {
      const response = await fetch(scriptUrl);
      const result = await response.json();

      if (result.status === 'success') {
        // Lọc bỏ dòng tiêu đề nếu còn sót
        allRegistrations = (result.data || []).filter(item => {
          return item.maNhom && item.maNhom.toLowerCase() !== 'mã nhóm' && item.thoiGian !== 'Thời gian';
        });

        // Cập nhật thống kê
        updateStats(result.stats, allRegistrations);

        // Hiển thị danh sách
        applyFilters();
      } else {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Lỗi từ máy chủ: ${result.message}</td></tr>`;
      }
    } catch (error) {
      console.error('Lỗi khi đọc dữ liệu:', error);
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Không thể tải dữ liệu: ${error.message}</td></tr>`;
    } finally {
      btnRefresh.disabled = false;
    }
  }

  // --- HÀM CẬP NHẬT THỐNG KÊ ---
  function updateStats(serverStats, list) {
    let total = list.length;
    let newCount = 0;
    let procCount = 0;
    let doneCount = 0;

    list.forEach(item => {
      const st = (item.trangThai || '').toLowerCase();
      if (st.includes('mới')) newCount++;
      else if (st.includes('xử lý')) procCount++;
      else if (st.includes('hoàn thành')) doneCount++;
    });

    document.querySelector('#statTotal').textContent = total;
    document.querySelector('#statNew').textContent = newCount;
    document.querySelector('#statProcessing').textContent = procCount;
    document.querySelector('#statDone').textContent = doneCount;
  }

  // --- HÀM ÁP DỤNG BỘ LỌC ---
  function applyFilters() {
    const statusVal = filterStatus.value.toLowerCase();
    const caVal = filterCa.value.toLowerCase();
    const searchVal = filterSearch.value.trim().toLowerCase();

    const filtered = allRegistrations.filter(item => {
      const matchStatus = !statusVal || (item.trangThai || '').toLowerCase() === statusVal;
      const matchCa = !caVal || (item.ca || '').toLowerCase().includes(caVal);
      const matchSearch = !searchVal ||
        (item.maNhom || '').toLowerCase().includes(searchVal) ||
        (item.thoiGian || '').toLowerCase().includes(searchVal) ||
        (item.tram || '').toLowerCase().includes(searchVal);

      return matchStatus && matchCa && matchSearch;
    });

    renderTable(filtered);
  }

  // --- HÀM VẼ BẢNG ---
  function renderTable(items) {
    const tableBody = document.querySelector('#tableBody');
    if (!items || items.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Không tìm thấy dữ liệu phù hợp.</td></tr>';
      return;
    }

    tableBody.innerHTML = items.map((item, index) => {
      const badgeClass = getBadgeClass(item.trangThai);
      return `
        <tr>
          <td><strong>${index + 1}</strong></td>
          <td>${escapeHtml(item.thoiGian || '')}</td>
          <td><code>${escapeHtml(item.maNhom || '')}</code></td>
          <td>${escapeHtml(item.tram || '')}</td>
          <td>${escapeHtml(item.ca || '')}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(item.trangThai || 'Mới')}</span></td>
        </tr>
      `;
    }).join('');
  }

  function getBadgeClass(status) {
    if (!status) return 'badge-default';
    const s = status.toLowerCase();
    if (s.includes('mới')) return 'badge-new';
    if (s.includes('xử lý')) return 'badge-processing';
    if (s.includes('hoàn thành')) return 'badge-done';
    return 'badge-default';
  }

  function showStatus(el, msg, type) {
    el.className = `status-box ${type}`;
    el.textContent = msg;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
});
