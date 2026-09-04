/**
 * ==============================================================================
 * BACKEND API GOOGLE APPS SCRIPT CHO HỆ THỐNG ĐĂNG KÝ CA MÔ PHỎNG
 * ==============================================================================
 * - doPost(e): Nhận dữ liệu từ Web Form, kiểm tra tính hợp lệ và ghi vào Google Sheets.
 * - doGet(e):  Đọc dữ liệu từ Google Sheets, hỗ trợ lọc theo ngày/trạng thái/ca/trạm
 *              và trả về kèm thống kê tổng hợp (JSON).
 * ==============================================================================
 */

// Cấu hình chung
const CONFIG = {
  SHEET_NAME: "YeuCau",               // Tên sheet chứa dữ liệu (khớp với file Excel mẫu)
  DEFAULT_STATUS: "Mới",              // Trạng thái mặc định khi thêm mới
  TIMEZONE: "Asia/Ho_Chi_Minh",       // Múi giờ Việt Nam (GMT+7)
  DATETIME_FORMAT: "yyyy-MM-dd HH:mm:ss"
};

/**
 * ------------------------------------------------------------------------------
 * 1. doPost(e) - GHI DỮ LIỆU ĐĂNG KÝ VÀO GOOGLE SHEETS
 * ------------------------------------------------------------------------------
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Khóa tối đa 10 giây để chống xung đột khi nhiều người gửi cùng lúc
  const hasLock = lock.tryLock(10000);

  if (!hasLock) {
    return createJsonResponse({
      status: "error",
      message: "Hệ thống đang bận xử lý yêu cầu khác, vui lòng thử lại sau vài giây."
    });
  }

  try {
    // 1. Phân tích dữ liệu gửi lên (Hỗ trợ JSON body, FormData hoặc URL parameters)
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const maNhom = (payload.maNhom || payload.ma_nhom || "").toString().trim();
    const tram = (payload.tram || payload.tramMoPhong || payload.tram_mo_phong || "").toString().trim();
    const ca = (payload.ca || payload.caHoc || payload.ca_hoc || "").toString().trim();

    // 2. Kiểm tra dữ liệu hợp lệ (Validation)
    const errors = [];
    if (!maNhom) {
      errors.push("Mã nhóm không được để trống.");
    } else if (maNhom.length > 20) {
      errors.push("Mã nhóm không được vượt quá 20 ký tự.");
    }

    if (!tram) {
      errors.push("Vui lòng chọn Trạm mô phỏng.");
    }

    if (!ca) {
      errors.push("Vui lòng chọn Ca học.");
    }

    if (errors.length > 0) {
      return createJsonResponse({
        status: "error",
        message: "Dữ liệu không hợp lệ: " + errors.join(" ")
      });
    }

    // 3. Mở Google Sheet
    const sheet = getTargetSheet();
    if (!sheet) {
      return createJsonResponse({
        status: "error",
        message: `Không tìm thấy bảng tính "${CONFIG.SHEET_NAME}".`
      });
    }

    // 4. Tạo thời gian ghi nhận (Timestamp)
    const now = new Date();
    const formattedTimestamp = Utilities.formatDate(now, CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);

    // 5. Chuẩn bị dòng dữ liệu mới theo thứ tự cột: [Thời gian, Mã nhóm, Trạm mô phỏng, Ca học, Trạng thái]
    const newRow = [
      formattedTimestamp,
      maNhom,
      tram,
      ca,
      CONFIG.DEFAULT_STATUS
    ];

    // 6. Ghi dữ liệu vào cuối bảng
    sheet.appendRow(newRow);

    // Định dạng căn lề cho dòng mới
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1, 1, 5).setVerticalAlignment("middle");

    return createJsonResponse({
      status: "success",
      message: "Đăng ký ca thực hành thành công!",
      data: {
        id: lastRow,
        thoiGian: formattedTimestamp,
        maNhom: maNhom,
        tram: tram,
        ca: ca,
        trangThai: CONFIG.DEFAULT_STATUS
      }
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Lỗi xử lý máy chủ: " + error.toString()
    });
  } finally {
    // Luôn giải phóng khóa
    lock.releaseLock();
  }
}

/**
 * ------------------------------------------------------------------------------
 * 2. doGet(e) - ĐỌC DỮ LIỆU VÀ THỐNG KÊ TỪ GOOGLE SHEETS
 * ------------------------------------------------------------------------------
 * Hỗ trợ tham số query (params):
 * - ?date=2026-08-28        : Lọc theo ngày (hoặc chuỗi ngày)
 * - ?status=Mới             : Lọc theo trạng thái ("Mới", "Đang xử lý", "Hoàn thành")
 * - ?ca=Sáng                : Lọc theo ca học ("Sáng", "Chiều")
 * - ?tram=Hồi sức cơ bản    : Lọc theo trạm mô phỏng
 */
function doGet(e) {
  try {
    const sheet = getTargetSheet();
    if (!sheet) {
      return createJsonResponse({
        status: "error",
        message: `Không tìm thấy bảng tính "${CONFIG.SHEET_NAME}".`
      });
    }

    const params = (e && e.parameter) ? e.parameter : {};
    const filterDate = (params.date || params.ngay || "").toString().trim().toLowerCase();
    const filterStatus = (params.status || params.trangThai || "").toString().trim().toLowerCase();
    const filterCa = (params.ca || params.caHoc || "").toString().trim().toLowerCase();
    const filterTram = (params.tram || params.tramMoPhong || "").toString().trim().toLowerCase();

    // 1. Xác định vị trí dòng tiêu đề (Header Row)
    const headerInfo = findHeaderRow(sheet);
    const startRow = headerInfo.row + 1;
    const lastRow = sheet.getLastRow();

    const listData = [];
    const stats = {
      total: 0,
      byStatus: {},
      byCa: {},
      byTram: {}
    };

    if (lastRow >= startRow) {
      const numRows = lastRow - startRow + 1;
      const values = sheet.getRange(startRow, 1, numRows, 5).getValues();

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const rawTime = row[0];
        const maNhom = (row[1] || "").toString().trim();
        const tram = (row[2] || "").toString().trim();
        const ca = (row[3] || "").toString().trim();
        const trangThai = (row[4] || "").toString().trim() || CONFIG.DEFAULT_STATUS;

        // Bỏ qua dòng trống hoàn toàn hoặc dòng tiêu đề lặp lại
        if ((!rawTime && !maNhom && !tram && !ca) || maNhom.toLowerCase() === "mã nhóm" || rawTime.toString().toLowerCase() === "thời gian") {
          continue;
        }

        const thoiGianFormatted = formatTimeValue(rawTime);

        // Thống kê toàn bộ dữ liệu hợp lệ (trước khi lọc)
        stats.total++;
        stats.byStatus[trangThai] = (stats.byStatus[trangThai] || 0) + 1;
        if (ca) stats.byCa[ca] = (stats.byCa[ca] || 0) + 1;
        if (tram) stats.byTram[tram] = (stats.byTram[tram] || 0) + 1;

        // Áp dụng bộ lọc (nếu có tham số truyền vào)
        if (filterDate && !thoiGianFormatted.toLowerCase().includes(filterDate)) {
          continue;
        }
        if (filterStatus && trangThai.toLowerCase() !== filterStatus) {
          continue;
        }
        if (filterCa && !ca.toLowerCase().includes(filterCa)) {
          continue;
        }
        if (filterTram && !tram.toLowerCase().includes(filterTram)) {
          continue;
        }

        listData.push({
          rowId: startRow + i,
          thoiGian: thoiGianFormatted,
          maNhom: maNhom,
          tram: tram,
          ca: ca,
          trangThai: trangThai
        });
      }
    }

    return createJsonResponse({
      status: "success",
      totalCount: stats.total,
      filteredCount: listData.length,
      stats: stats,
      data: listData
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Lỗi khi đọc dữ liệu: " + error.toString()
    });
  }
}

/**
 * ------------------------------------------------------------------------------
 * CÁC HÀM TIỆN ÍCH HỖ TRỢ (HELPER FUNCTIONS)
 * ------------------------------------------------------------------------------
 */

function getTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getSheets()[0];
}

function findHeaderRow(sheet) {
  const maxScanRows = Math.min(sheet.getLastRow(), 15);
  if (maxScanRows < 1) return { row: 4 };

  const rangeValues = sheet.getRange(1, 1, maxScanRows, Math.min(sheet.getLastColumn() || 5, 5)).getValues();

  for (let r = 0; r < rangeValues.length; r++) {
    const row = rangeValues[r].map(c => (c || "").toString().trim().toLowerCase());
    // Kiểm tra dòng tiêu đề chính thức
    if (row.includes("mã nhóm") || (row.includes("thời gian") && row.includes("ca học"))) {
      return { row: r + 1 };
    }
  }

  // Mặc định dòng 4 theo cấu trúc template Excel
  return { row: 4 };
}

function formatTimeValue(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);
  }
  // Xử lý số serial ngày tháng của Excel
  if (typeof val === "number" && val > 40000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return Utilities.formatDate(date, CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);
  }
  return val.toString();
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSheetTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  sheet.getRange("A1:E1").merge().setValue("ĐĂNG KÝ CA THỰC HÀNH MÔ PHỎNG — DỮ LIỆU TỐI GIẢN")
       .setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center").setBackground("#E8F0FE");
  sheet.getRange("A2:E2").merge().setValue("Chỉ dùng mã nhóm và lựa chọn chung. Không nhập họ tên, mã sinh viên, dữ liệu người bệnh hoặc ca lâm sàng thật.")
       .setFontStyle("italic").setFontSize(10).setHorizontalAlignment("center").setFontColor("#5F6368");

  const headers = [["Thời gian", "Mã nhóm", "Trạm mô phỏng", "Ca học", "Trạng thái"]];
  const headerRange = sheet.getRange(4, 1, 1, 5);
  headerRange.setValues(headers);
  headerRange.setFontWeight("bold").setBackground("#1A73E8").setFontColor("#FFFFFF").setHorizontalAlignment("center");

  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 140);

  SpreadsheetApp.flush();
  Logger.log("Khởi tạo cấu trúc bảng tính thành công!");
}
