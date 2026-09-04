// Lấy cấu hình URL API từ config.js hoặc mặc định localhost:5000
const API_URL = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || 'http://localhost:5000/api/yeu-cau';

const form = document.querySelector('#requestForm');
const statusEl = document.querySelector('#status');
const submitBtn = document.querySelector('#submitBtn');
const refreshBtn = document.querySelector('#refreshBtn');
const recordsBody = document.querySelector('#recordsBody');

// Helper định dạng ngày giờ
function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (e) {
    return isoString;
  }
}

// -------------------------------------------------------------
// 1. GET: Lấy danh sách yêu cầu mới nhất và render ra bảng HTML
// -------------------------------------------------------------
async function loadDanhSachYeuCau() {
  if (!recordsBody) return;

  try {
    recordsBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #627d98;">Đang tải danh sách...</td>
      </tr>
    `;

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `Lỗi máy chủ (${response.status})`);
    }

    const items = result.data || [];
    if (items.length === 0) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #829ab1;">Chưa có bản ghi nào trong cơ sở dữ liệu.</td>
        </tr>
      `;
      return;
    }

    recordsBody.innerHTML = items.map((item) => `
      <tr>
        <td><strong>#${item.id}</strong></td>
        <td>${escapeHtml(item.ma_nhom || '')}</td>
        <td>${escapeHtml(item.tram || '')}</td>
        <td>${escapeHtml(item.ca || '')}</td>
        <td><small style="color: #627d98;">${formatDate(item.created_at)}</small></td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Lỗi khi tải danh sách:', error);
    recordsBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #d6336c;">
          Không thể kết nối đến Backend (${error.message}). Hãy chắc chắn backend đang chạy tại ${API_URL}.
        </td>
      </tr>
    `;
  }
}

// Chống XSS khi render dữ liệu động
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------------------------------------------------------------
// 2. POST: Gửi form đăng ký lên Backend API
// -------------------------------------------------------------
if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);

    statusEl.className = 'status-loading';
    statusEl.textContent = '⏳ Đang gửi dữ liệu lên Backend và lưu vào Supabase...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Gửi yêu cầu không thành công');
      }

      statusEl.className = 'status-success';
      statusEl.textContent = '✅ Đăng ký thành công! Dữ liệu đã được lưu vào Supabase.';
      form.reset();

      // Cập nhật lại bảng danh sách ngay lập tức
      await loadDanhSachYeuCau();

    } catch (error) {
      console.error('Lỗi gửi form:', error);
      statusEl.className = 'status-error';
      statusEl.textContent = `❌ Lỗi: ${error.message}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Nút làm mới danh sách thủ công
if (refreshBtn) {
  refreshBtn.addEventListener('click', loadDanhSachYeuCau);
}

// Tự động tải danh sách khi vừa mở trang web
document.addEventListener('DOMContentLoaded', loadDanhSachYeuCau);
