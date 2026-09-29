// Стискає й зменшує фото в браузері ПЕРЕД завантаженням у сховище —
// це набагато економить місце і, найголовніше, трафік (egress) при кожному
// перегляді товару, бо фото з телефону часто важать 2-5 МБ, а для мініатюри
// й навіть збільшеного перегляду в застосунку вистачає значно меншого розміру.
export function compressImage(file, maxSize = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file); // не фото — пропускаємо без змін
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // якщо щось пішло не так — краще завантажити оригінал, ніж нічого
              return;
            }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
