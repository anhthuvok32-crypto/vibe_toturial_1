const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// Ưu tiên sử dụng SECRET KEY trên Backend để có đầy đủ quyền thao tác dữ liệu (bypass RLS)
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Cảnh báo: Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong file .env');
}

// Khởi tạo Supabase Client tối ưu kết nối cho môi trường Node.js Backend
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: ws },
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * Thêm yêu cầu đăng ký mới vào bảng yeu_cau
 * @param {Object} param0 { maNhom, tram, ca }
 * @returns {Promise<Object>} Bản ghi vừa được tạo
 */
async function insertYeuCau({ maNhom, tram, ca }) {
  const { data, error } = await supabase
    .from('yeu_cau')
    .insert([
      {
        ma_nhom: maNhom.trim(),
        tram: tram.trim(),
        ca: ca.trim()
      }
    ])
    .select('id, ma_nhom, tram, ca, created_at');

  if (error) {
    throw new Error(error.message);
  }
  return data && data[0];
}

/**
 * Lấy danh sách các yêu cầu đăng ký mới nhất
 * @param {number} limit Số lượng bản ghi tối đa (mặc định 50)
 * @returns {Promise<Array>} Danh sách bản ghi
 */
async function getYeuCauList(limit = 50) {
  const { data, error } = await supabase
    .from('yeu_cau')
    .select('id, ma_nhom, tram, ca, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}

module.exports = {
  supabase,
  insertYeuCau,
  getYeuCauList
};
