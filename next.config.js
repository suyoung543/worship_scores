/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // 악보 페이지 이미지(여러 장)를 서버 액션으로 바로 업로드하기 위해 넉넉히 잡습니다.
      bodySizeLimit: '30mb',
    },
  },
};

module.exports = nextConfig;
