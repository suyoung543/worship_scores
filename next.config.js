/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // 악보 페이지 이미지(여러 장)를 서버 액션으로 바로 업로드하기 위해 넉넉히 잡습니다.
      bodySizeLimit: '30mb',
    },
    // content/guide.md 는 fs.readFileSync로 직접 읽어서 빌드 추적이 못 잡기 때문에,
    // Vercel 배포본에서 빠지지 않도록 모든 라우트에 명시적으로 포함시킵니다.
    outputFileTracingIncludes: {
      '/**': ['./content/**/*'],
    },
  },
};

module.exports = nextConfig;
