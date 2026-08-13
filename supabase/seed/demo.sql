-- =============================================================================
-- 4FMOTORS CRM — dados de demonstração
-- =============================================================================
-- NÃO é uma migration. Fica fora de `supabase/migrations/` de propósito, para
-- nunca rodar sozinho em produção. Execute manualmente no SQL Editor.
--
-- Para que serve: a inbox é o coração do sistema e, vazia, não diz nada sobre
-- a experiência. Isto popula equipe, prospects, conversas e mensagens para a
-- tela poder ser avaliada antes de existir integração com a Meta.
--
-- PRÉ-REQUISITO: já existe um administrador. Crie seu usuário em
-- Authentication · Users e rode:
--   update public.profiles set role = 'admin' where email = 'seu@email.com';
--
-- Os consignadores de demonstração entram com a senha:  demo4fmotors
--
-- Para remover tudo depois: supabase/seed/demo_cleanup.sql
-- =============================================================================

-- Cria um usuário de autenticação. Temporária: some ao fim da sessão.
create or replace function pg_temp.demo_user(p_email text, p_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, crypt('demo4fmotors', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name),
    '', '', '', ''
  );

  -- O trigger handle_new_auth_user já criou o profile como consignador.
  return v_id;
end;
$$;

do $$
declare
  v_admin      uuid;
  v_breno      uuid;
  v_luisa      uuid;
  v_julio      uuid;
  v_marcos     uuid;

  v_shared     uuid;
  v_individual uuid;

  v_owner      uuid;
  v_contact    uuid;
  v_conversation uuid;

  v_row        record;
  v_turn       jsonb;
  v_script     jsonb;
  v_base       timestamptz;
  v_at         timestamptz;
  v_index      int;
begin
  -- ---------------------------------------------------------------------------
  -- Equipe
  -- ---------------------------------------------------------------------------
  select id into v_admin
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception
      'Nenhum administrador ativo encontrado. Crie seu usuário e promova a admin antes de rodar o seed.';
  end if;

  v_breno  := pg_temp.demo_user('breno@demo.4fmotors.local',  'Breno Camargo');
  v_luisa  := pg_temp.demo_user('luisa@demo.4fmotors.local',  'Luísa Ferraz');
  v_julio  := pg_temp.demo_user('julio@demo.4fmotors.local',  'Júlio Antunes');
  v_marcos := pg_temp.demo_user('marcos@demo.4fmotors.local', 'Marcos Vieira');

  update public.profiles
  set role = 'consignador', is_active = true
  where id in (v_breno, v_luisa, v_julio, v_marcos);

  -- ---------------------------------------------------------------------------
  -- Números de WhatsApp
  -- ---------------------------------------------------------------------------
  -- Um compartilhado da loja e um individual: é o modo híbrido em operação, e
  -- deixa visível na inbox a marcação de quem enviou cada mensagem.
  insert into public.whatsapp_accounts (
    display_name, phone_e164, phone_number_id, waba_id, mode, status,
    default_owner_user_id, coexistence_enabled
  )
  values (
    '4FMOTORS Principal', '+551140041234', 'DEMO_PNID_PRINCIPAL', 'DEMO_WABA',
    'shared', 'connected', v_breno, true
  )
  on conflict (phone_number_id) do update set display_name = excluded.display_name
  returning id into v_shared;

  insert into public.whatsapp_accounts (
    display_name, phone_e164, phone_number_id, waba_id, mode, status,
    default_owner_user_id
  )
  values (
    'Luísa · Individual', '+5511970001234', 'DEMO_PNID_LUISA', 'DEMO_WABA',
    'individual', 'connected', v_luisa
  )
  on conflict (phone_number_id) do update set display_name = excluded.display_name
  returning id into v_individual;

  insert into public.user_whatsapp_permissions (user_id, whatsapp_account_id)
  select u, v_shared from unnest(array[v_breno, v_julio, v_marcos, v_luisa]) as u
  on conflict (user_id, whatsapp_account_id) do nothing;

  insert into public.user_whatsapp_permissions (user_id, whatsapp_account_id)
  values (v_luisa, v_individual)
  on conflict (user_id, whatsapp_account_id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Prospects
  -- ---------------------------------------------------------------------------
  -- Telefones na faixa +55 11 9000-xxxx, reservada para a demonstração: é por
  -- ela que o script de limpeza reconhece o que apagar.
  for v_row in
    select *
    from (values
      -- nome, telefone, marca, modelo, versão, ano, km, preço, plataforma, status, dono
      ('João Batista',      '+5511900000001', 'Toyota',     'Corolla',   'XEI 2.0',        2021, 42000, 118900, 'OLX',                  'negociacao',  1),
      ('Carlos Menezes',    '+5511900000002', 'Honda',      'Civic',     'EXL 2.0',        2020, 58000, 112000, 'Webmotors',            'interessado', 1),
      ('Patrícia Lopes',    '+5511900000003', 'Jeep',       'Compass',   'Longitude 2.0',  2022, 31000, 149900, 'iCarros',              'respondeu',   1),
      ('Rogério Tavares',   '+5511900000004', 'Volkswagen', 'T-Cross',   'Comfortline',    2021, 47000,  99900, 'OLX',                  'contatado',   1),
      ('Sandra Nogueira',   '+5511900000005', 'Fiat',       'Toro',      'Freedom 1.8',    2020, 66000,  96500, 'Facebook Marketplace', 'sem_resposta',1),
      ('Eduardo Pires',     '+5511900000006', 'Chevrolet',  'Tracker',   'Premier 1.2',    2022, 28000, 124900, 'Webmotors',            'consignado',  1),
      ('Marina Rocha',      '+5511900000007', 'Hyundai',    'Creta',     'Action 1.6',     2023, 19000, 132900, 'OLX',                  'novo',        1),

      ('Felipe Andrade',    '+5511900000008', 'Toyota',     'Hilux',     'SRV 2.8 4x4',    2021, 71000, 289900, 'iCarros',              'negociacao',  2),
      ('Cláudia Bertoldo',  '+5511900000009', 'Renault',    'Duster',    'Iconic 1.6',     2022, 34000, 109900, 'OLX',                  'interessado', 2),
      ('Alexandre Ramos',   '+5511900000010', 'Nissan',     'Kicks',     'Advance 1.6',    2021, 52000,  94900, 'Webmotors',            'respondeu',   2),
      ('Beatriz Salles',    '+5511900000011', 'Peugeot',    '208',       'Griffe 1.6',     2023, 16000,  92900, 'Mercado Livre',        'contatado',   2),
      ('Henrique Dias',     '+5511900000012', 'Ford',       'Ranger',    'XLT 3.2',        2019, 98000, 219900, 'OLX',                  'perdido',     2),
      ('Tatiane Moura',     '+5511900000013', 'Volkswagen', 'Nivus',     'Highline 1.0',   2022, 29000, 118900, 'iCarros',              'consignado',  2),

      ('Ricardo Fontes',    '+5511900000014', 'BMW',        '320i',      'Sport GP',       2020, 61000, 189900, 'Webmotors',            'interessado', 3),
      ('Juliana Prado',     '+5511900000015', 'Audi',       'A3',        'Sedan Prestige', 2021, 38000, 179900, 'iCarros',              'respondeu',   3),
      ('Marcelo Vasques',   '+5511900000016', 'Chevrolet',  'Onix',      'LTZ 1.0 Turbo',  2022, 41000,  87900, 'OLX',                  'contatado',   3),
      ('Simone Barreto',    '+5511900000017', 'Fiat',       'Argo',      'Trekking 1.3',   2021, 55000,  74900, 'Facebook Marketplace', 'sem_resposta',3),
      ('Gustavo Leal',      '+5511900000018', 'Honda',      'HR-V',      'Touring 1.5',    2023, 22000, 159900, 'Webmotors',            'novo',        3),

      ('Renata Coelho',     '+5511900000019', 'Toyota',     'Yaris',     'XLS 1.5',        2021, 44000,  89900, 'OLX',                  'respondeu',   4),
      ('Paulo Sérgio',      '+5511900000020', 'Mitsubishi', 'L200',      'Triton Sport',   2020, 88000, 209900, 'iCarros',              'contatado',   4),
      ('Vanessa Lima',      '+5511900000021', 'Volkswagen', 'Polo',      'Highline 1.0',   2022, 33000,  92900, 'Mercado Livre',        'novo',        4),
      ('Anderson Freitas',  '+5511900000022', 'Caoa Chery', 'Tiggo 5x',  'Pro 1.5',        2023, 18000, 129900, 'OLX',                  'interessado', 4)
    ) as t(nome, telefone, marca, modelo, versao, ano, km, preco, plataforma, status, dono)
  loop
    v_owner := case v_row.dono
      when 1 then v_breno
      when 2 then v_luisa
      when 3 then v_julio
      else v_marcos
    end;

    -- Espalha o cadastro pelos últimos 30 dias, para os gráficos por dia
    -- terem forma em vez de uma barra única.
    v_base := now() - (make_interval(days => (v_row.dono * 3 + length(v_row.nome) % 9)));

    insert into public.contacts (
      full_name, phone_e164, phone_raw, owner_user_id, status,
      source_platform, listing_url, created_by, created_at
    )
    values (
      v_row.nome, v_row.telefone, v_row.telefone, v_owner, v_row.status::public.lead_status,
      v_row.plataforma,
      'https://exemplo.' || lower(replace(v_row.plataforma, ' ', '')) || '.com.br/anuncio/'
        || lower(v_row.modelo),
      v_owner, v_base
    )
    on conflict (phone_e164) do nothing
    returning id into v_contact;

    -- Já existia de uma execução anterior: segue para o próximo.
    if v_contact is null then
      continue;
    end if;

    insert into public.vehicles (
      contact_id, brand, model, version, year, model_year, km,
      listed_price, listing_url, source_platform, is_primary
    )
    values (
      v_contact, v_row.marca, v_row.modelo, v_row.versao, v_row.ano, v_row.ano + 1,
      v_row.km, v_row.preco,
      'https://exemplo.' || lower(replace(v_row.plataforma, ' ', '')) || '.com.br/anuncio/'
        || lower(v_row.modelo),
      v_row.plataforma, true
    );

    -- Luísa atende pelo número dela; o resto da equipe, pelo da loja.
    insert into public.conversations (contact_id, whatsapp_account_id, assigned_user_id)
    values (
      v_contact,
      case when v_owner = v_luisa then v_individual else v_shared end,
      v_owner
    )
    returning id into v_conversation;

    -- -------------------------------------------------------------------------
    -- Diálogo, escolhido pelo estágio do funil
    -- -------------------------------------------------------------------------
    v_script := case v_row.status
      when 'novo' then '[]'::jsonb

      when 'contatado' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Boa tarde! Vi seu anúncio do ' || v_row.modelo ||
          '. Sou da 4FMOTORS. Você teria interesse em deixar em consignação na nossa loja?')
      )

      when 'sem_resposta' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Bom dia! Passando sobre o ' || v_row.modelo ||
          ' do seu anúncio. Podemos conversar?'),
        jsonb_build_object('d', 'out', 't', 'Oi! Conseguiu ver minha mensagem?')
      )

      when 'respondeu' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Olá! Vi seu ' || v_row.modelo ||
          ' anunciado. Sou consultor da 4FMOTORS, trabalhamos com consignação.'),
        jsonb_build_object('d', 'in',  't', 'Boa tarde. Como funciona isso?'),
        jsonb_build_object('d', 'out', 't',
          'O carro fica exposto na loja, cuidamos da divulgação e da papelada. Você só recebe quando vende, sem custo antecipado.'),
        jsonb_build_object('d', 'in',  't', 'Entendi. E quanto tempo costuma levar?')
      )

      when 'interessado' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Boa tarde! Sobre o ' || v_row.modelo ||
          ' que você anunciou — temos procura por esse modelo.'),
        jsonb_build_object('d', 'in',  't', 'Oi! Estou anunciando faz um mês e apareceu pouca gente.'),
        jsonb_build_object('d', 'out', 't',
          'É comum. Na loja o giro é bem mais rápido, temos vitrine física e anúncios em vários portais.'),
        jsonb_build_object('d', 'in',  't', 'Gostei. Quais são as condições?'),
        jsonb_build_object('d', 'out', 't',
          'Trabalhamos com comissão sobre a venda, sem taxa de permanência. Posso te passar os detalhes.'),
        jsonb_build_object('d', 'in',  't', 'Pode mandar. Estou bem interessado.')
      )

      when 'negociacao' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Bom dia! Sobre o ' || v_row.modelo || ' — tudo certo?'),
        jsonb_build_object('d', 'in',  't', 'Bom dia! Estou avaliando a proposta que você mandou.'),
        jsonb_build_object('d', 'out', 't',
          'Sem pressa. Uma dúvida: o veículo tem alguma restrição ou multa em aberto?'),
        jsonb_build_object('d', 'in',  't', 'Nada. Documento em dia e revisões todas na concessionária.'),
        jsonb_build_object('d', 'out', 't',
          'Perfeito, isso ajuda bastante no valor. Consegue trazer para avaliação esta semana?'),
        jsonb_build_object('d', 'in',  't', 'Consigo quinta de manhã. Qual o endereço?'),
        jsonb_build_object('d', 'out', 't', 'Ótimo! Te mando a localização e confirmo o horário.')
      )

      when 'consignado' then jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Boa tarde! Sobre o ' || v_row.modelo || ', podemos conversar?'),
        jsonb_build_object('d', 'in',  't', 'Boa tarde, pode sim.'),
        jsonb_build_object('d', 'out', 't', 'Consegue trazer para avaliação?'),
        jsonb_build_object('d', 'in',  't', 'Levei ontem, conversei com o pessoal aí.'),
        jsonb_build_object('d', 'out', 't',
          'Isso! Contrato assinado e o carro já está na vitrine. Qualquer proposta eu te aviso na hora.'),
        jsonb_build_object('d', 'in',  't', 'Combinado, obrigado!')
      )

      else jsonb_build_array(
        jsonb_build_object('d', 'out', 't', 'Boa tarde! Sobre o ' || v_row.modelo || ' do anúncio.'),
        jsonb_build_object('d', 'in',  't', 'Obrigado, mas acabei vendendo para um conhecido.'),
        jsonb_build_object('d', 'out', 't', 'Sem problema! Qualquer coisa no futuro, estou à disposição.')
      )
    end;

    -- A conversa termina há poucas horas: mantém a janela de 24h aberta na
    -- maioria dos casos, para o campo de resposta ficar utilizável na demo.
    --
    -- O `greatest` prende o início ao dia local: rodando o seed de madrugada,
    -- "5 horas atrás" cairia no dia anterior e o painel "Hoje" nasceria vazio.
    v_index := 0;
    v_base := greatest(
      now() - interval '5 hours',
      (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 hour')
        at time zone 'America/Sao_Paulo'
    );

    for v_turn in select * from jsonb_array_elements(v_script)
    loop
      v_at := v_base + (v_index * interval '11 minutes');

      insert into public.messages (
        provider_message_id, conversation_id, whatsapp_account_id, contact_id,
        direction, message_type, content, sent_by_user_id, status, wa_timestamp
      )
      values (
        'demo.' || v_conversation || '.' || v_index,
        v_conversation,
        case when v_owner = v_luisa then v_individual else v_shared end,
        v_contact,
        case when v_turn ->> 'd' = 'out' then 'outbound' else 'inbound' end::public.message_direction,
        'text',
        v_turn ->> 't',
        case when v_turn ->> 'd' = 'out' then v_owner else null end,
        case when v_turn ->> 'd' = 'out' then 'read' else 'received' end::public.message_status,
        v_at
      );

      v_index := v_index + 1;
    end loop;

    -- Conversas antigas de quem não respondeu: mostra a janela de 24h fechada
    -- e o caminho do template aprovado.
    if v_row.status = 'sem_resposta' then
      update public.messages
      set wa_timestamp = wa_timestamp - interval '6 days'
      where conversation_id = v_conversation;

      update public.conversations
      set last_message_at = last_message_at - interval '6 days',
          service_window_expires_at = now() - interval '2 days'
      where id = v_conversation;
    end if;

    -- Nota do consignador em parte dos atendimentos.
    if v_row.status in ('negociacao', 'interessado', 'consignado') then
      insert into public.notes (contact_id, author_user_id, body)
      values (
        v_contact, v_owner,
        case v_row.status
          when 'negociacao' then 'Proprietário topou trazer para avaliação. Confirmar horário na quarta.'
          when 'interessado' then 'Anúncio parado há um mês, aberto a proposta. Retornar com a tabela.'
          else 'Contrato assinado. Veículo já na vitrine.'
        end
      );
    end if;

    -- Próxima ação em quem está em movimento — alimenta o filtro da lista.
    if v_row.status in ('negociacao', 'respondeu') then
      update public.contacts
      set next_action_at = now() + make_interval(hours => (v_row.dono * 7) - 12),
          next_action_note = case v_row.status
            when 'negociacao' then 'Confirmar avaliação presencial'
            else 'Enviar condições de consignação'
          end
      where id = v_contact;
    end if;

    v_contact := null;
  end loop;

  -- O trigger soma uma não lida por mensagem recebida, então toda conversa
  -- terminaria marcada como pendente — inclusive as que acabam com resposta
  -- nossa. Zera tudo e marca só algumas, que é o estado realista.
  update public.conversations set unread_count = 0;

  update public.conversations c
  set unread_count = 2
  from public.contacts ct
  where ct.id = c.contact_id
    and ct.phone_e164 in ('+5511900000003', '+5511900000009', '+5511900000015', '+5511900000022');

  raise notice 'Seed concluído. Consignadores: breno@ / luisa@ / julio@ / marcos@demo.4fmotors.local — senha demo4fmotors';
end;
$$;
