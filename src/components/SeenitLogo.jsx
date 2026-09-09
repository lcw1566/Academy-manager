// 씨닛 공식 브랜드 마크.
// 화면마다 임시 아이콘을 따로 두지 않고 docs/brand 와 동기화되는
// public/icon-192.png 한 곳을 사용한다.
export default function SeenitLogo({ className = '', alt = '', ...props }) {
  return (
    <img
      src="/icon-192.png"
      alt={alt}
      className={`block shrink-0 object-cover ${className}`}
      draggable="false"
      {...props}
    />
  );
}
