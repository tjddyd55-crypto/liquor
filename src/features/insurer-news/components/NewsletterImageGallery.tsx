type Props = {
  imageUrls: string[]
  altBase?: string
}

/** 상세 화면: 슬라이드·인디케이터 없이 이미지를 세로로 나열 */
export function NewsletterImageGallery({ imageUrls, altBase = '소식지 이미지' }: Props) {
  if (imageUrls.length === 0) {
    return null
  }

  return (
    <div className="insurer-news-gallery insurer-news-gallery--stacked" style={{ marginTop: 16 }}>
      {imageUrls.map((url, idx) => (
        <img
          key={`${url}-${idx}`}
          src={url}
          alt={`${altBase} ${idx + 1}`}
          loading={idx === 0 ? 'eager' : 'lazy'}
          style={{ width: '100%', display: 'block', marginBottom: 12 }}
        />
      ))}
    </div>
  )
}
