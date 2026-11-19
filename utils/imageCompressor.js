/**
 * Utilitário para compressão e conversão de imagens para o formato WebP no navegador.
 * Redimensiona proporcionalmente mantendo a proporção da foto e reduz o peso
 * drasticamente para evitar timeouts de rede e limites de payload em requisições móveis.
 */

export async function compressImageToWebP(file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
    if (!file || !(file instanceof Blob) || !file.type.startsWith('image/')) {
        return file;
    }

    // Se estiver rodando no servidor (SSR), retorna sem processar
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onerror = () => {
            console.warn('[imageCompressor] Falha na leitura do arquivo. Enviando original.');
            resolve(file);
        };

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => {
                console.warn('[imageCompressor] Falha ao decodificar imagem. Enviando original.');
                resolve(file);
            };

            img.onload = () => {
                try {
                    let { width, height } = img;

                    // Calcula o redimensionamento proporcional
                    if (width > maxWidth || height > maxHeight) {
                        const proporcaoLargura = maxWidth / width;
                        const proporcaoAltura = maxHeight / height;
                        const fatorReducao = Math.min(proporcaoLargura, proporcaoAltura);

                        width = Math.round(width * fatorReducao);
                        height = Math.round(height * fatorReducao);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(file);
                        return;
                    }

                    // Desenha a imagem redimensionada no canvas
                    ctx.drawImage(img, 0, 0, width, height);

                    // Converte para WebP
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                console.warn('[imageCompressor] Conversão para WebP não gerou blob. Usando original.');
                                resolve(file);
                                return;
                            }

                            // Altera o nome do arquivo para .webp
                            const nomeOriginal = file.name || 'foto.jpg';
                            const nomeSemExtensao = nomeOriginal.replace(/\.[^/.]+$/, '');
                            const novoNome = `${nomeSemExtensao}.webp`;

                            const arquivoWebP = new File([blob], novoNome, {
                                type: 'image/webp',
                                lastModified: Date.now(),
                            });

                            const tamanhoAntesKB = (file.size / 1024).toFixed(1);
                            const tamanhoDepoisKB = (arquivoWebP.size / 1024).toFixed(1);
                            console.info(`[imageCompressor] Foto comprimida para WebP: ${tamanhoAntesKB} KB -> ${tamanhoDepoisKB} KB (${novoNome})`);

                            resolve(arquivoWebP);
                        },
                        'image/webp',
                        quality
                    );
                } catch (err) {
                    console.warn('[imageCompressor] Erro durante a compressão no canvas:', err);
                    resolve(file);
                }
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}

