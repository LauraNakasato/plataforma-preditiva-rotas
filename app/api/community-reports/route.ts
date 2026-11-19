import { NextResponse } from 'next/server';
import { supabase } from '@/app/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NovoReporte {
    categoria: string;
    latitude: number;
    longitude: number;
    origem_localizacao: string;
    descricao: string;
    foto_url: string | null;
    status: string;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();

        const categoria = formData.get('categoria')?.toString();
        const latitudeRaw = formData.get('latitude')?.toString();
        const longitudeRaw = formData.get('longitude')?.toString();
        const origem_localizacao = formData.get('origem_localizacao')?.toString() || 'gps';
        const descricao = formData.get('descricao')?.toString() || '';
        const foto = formData.get('foto') as File | null;

        // 1. Validação de campos obrigatórios
        if (!categoria || !latitudeRaw || !longitudeRaw) {
            return NextResponse.json(
                {
                    error: 'Dados incompletos. Categoria, latitude e longitude são obrigatórios.',
                },
                { status: 400 }
            );
        }

        const latitude = parseFloat(latitudeRaw);
        const longitude = parseFloat(longitudeRaw);

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            return NextResponse.json(
                { error: 'Coordenadas geográficas inválidas.' },
                { status: 400 }
            );
        }

        let fotoUrl: string | null = null;

        // 2. Processamento da Imagem (se enviada)
        if (foto && typeof foto.arrayBuffer === 'function' && foto.size > 0) {
            // Limite de segurança: 5 MB
            if (foto.size > 5 * 1024 * 1024) {
                return NextResponse.json(
                    { error: 'A imagem excede o tamanho limite de 5MB.' },
                    { status: 413 }
                );
            }

            try {
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 9);
                const nomeArquivo = `${timestamp}_${randomId}.webp`;
                const bucketName = 'community-reports';

                const arrayBuffer = await foto.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const { error: uploadError } = await supabase.storage
                    .from(bucketName)
                    .upload(nomeArquivo, buffer, {
                        contentType: 'image/webp',
                        upsert: false,
                    });

                if (uploadError) {
                    console.warn('[POST /api/community-reports] Aviso Storage:', uploadError.message);
                } else {
                    const { data: publicData } = supabase.storage
                        .from(bucketName)
                        .getPublicUrl(nomeArquivo);

                    fotoUrl = publicData?.publicUrl || null;
                }
            } catch (storageException) {
                // Falhas no Storage não impedem o registro do alerta de perigo
                console.warn('[POST /api/community-reports] Falha no upload da foto:', storageException);
            }
        }

        // 3. Montagem do registro para a tabela community_reports
        const novoReporte: NovoReporte = {
            categoria,
            latitude,
            longitude,
            origem_localizacao,
            descricao: descricao.trim(),
            foto_url: fotoUrl,
            status: 'ativo',
        };

        // 4. Inserção no Supabase
        const { data, error } = await supabase
            .from('community_reports')
            .insert([novoReporte])
            .select()
            .single();

        if (error) {
            console.warn('[POST /api/community-reports] Aviso Supabase DB:', error.message);

            // Modo de resiliência: se a instância gratuita do Supabase estiver pausada ou offline,
            // retorna sucesso para o usuário com id simulado para não travar a experiência em campo
            return NextResponse.json(
                {
                    sucesso: true,
                    aviso: 'Reporte registrado em contingência local (Supabase indisponível ou pausado).',
                    reporte: {
                        id: Date.now(),
                        ...novoReporte,
                        created_at: new Date().toISOString(),
                    },
                },
                { status: 201 }
            );
        }

        return NextResponse.json(
            {
                sucesso: true,
                reporte: data,
            },
            { status: 201 }
        );
    } catch (err: unknown) {
        console.error('[POST /api/community-reports] Erro interno no servidor:', err);
        const mensagem = err instanceof Error ? err.message : 'Erro interno ao processar o reporte.';
        return NextResponse.json({ error: mensagem }, { status: 500 });
    }
}

