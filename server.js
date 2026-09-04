const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoint kiểm tra trạng thái hoạt động (Health check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Supabase Backend Bridge',
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------
// 1. POST /api/yeu-cau: Tiếp nhận đăng ký, validate và lưu vào Supabase
// ---------------------------------------------------------------------
app.post('/api/yeu-cau', async (req, res) => {
  try {
    const { maNhom, tram, ca } = req.body;

    // Validate dữ liệu bắt buộc
    if (!maNhom || !tram || !ca) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin: maNhom, tram, ca.'
      });
    }

    // Lưu vào cơ sở dữ liệu Supabase
    const newRecord = await db.insertYeuCau({ maNhom, tram, ca });

    return res.status(201).json({
      success: true,
      message: 'Gửi yêu cầu đăng ký thành công!',
      data: newRecord
    });
  } catch (error) {
    console.error('❌ Lỗi khi thêm dữ liệu vào bảng yeu_cau:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi thao tác cơ sở dữ liệu.',
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------
// 2. GET /api/yeu-cau: Lấy danh sách bản ghi mới nhất
// ---------------------------------------------------------------------
app.get('/api/yeu-cau', async (req, res) => {
  try {
    const records = await db.getYeuCauList(50);

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('❌ Lỗi khi truy vấn bảng yeu_cau:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi truy vấn dữ liệu.',
      error: error.message
    });
  }
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`🚀 Backend API đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Endpoint POST: http://localhost:${PORT}/api/yeu-cau`);
  console.log(`📡 Endpoint GET:  http://localhost:${PORT}/api/yeu-cau`);
  console.log(`🩺 Health Check:  http://localhost:${PORT}/api/health`);
});
