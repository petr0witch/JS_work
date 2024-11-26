const BASE_URL = 'https://5ballov.russianpost.ru';
const ACCELERATION_URL = agentSettings.acceleration_url;
const AUTHORIZATION_TOKEN = agentSettings.authorization_token;
const COMMENT = agentSettings.comment; // comment передаётся из настроек
axios.defaults.timeout = agentSettings.timeout;

const getSlotValue = (slotId) =>
    message.slot_context?.filled_slots?.find((slot) => slot.slot_id === slotId)?.value || null;

async function createApi() {
    const instance = axios.create({
        baseURL: BASE_URL,
        httpsAgent: new https.Agent({
            secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
            rejectUnauthorized: false,
        }),
    });
    
    instance.defaults.timeout = 600000;
    return instance;
}

async function sendPostRequest(comment) {
    try {
        const data = { comment }; // Передаём комментарий

        const config = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: AUTHORIZATION_TOKEN,
            },
            httpsAgent: new https.Agent({
                secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
                rejectUnauthorized: false,
            }),
        };

        const response = await axios.post(ACCELERATION_URL, data, config);
        logger.info(`POST-запрос отправлен с данными: ${JSON.stringify(data)}`);
        return response.data;
    } catch (error) {
        logger.error(`Ошибка при POST-запросе: ${JSON.stringify(error.response ? error.response.data : error.message)}`);
        return { error: error.response ? error.response.data : error.message };
    }
}

async function sendGetRequest(api) {
    try {
        const response = await api.get('magic/api/cftalk.php');
        logger.info(`Ответ GET-запроса: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (error) {
        logger.error(`Ошибка при GET-запросе: ${JSON.stringify(error.response ? error.response.data : error.message)}`);
        return { error: error.response ? error.response.data : error.message };
    }
}

async function sendMessage(reply) {
    try {
        const resp_message = await agentApi.sendMessage(
            {
                MessageMarkdown: reply,
                SendMessageParams: {
                    ProjectId: message.user?.customer_id || message.channel?.customer_id,
                    OmniUserId: message.user?.omni_user_id,
                    Sender: {},
                    FilledSlots: {},
                },
            },
            logger
        );

        if (!resp_message.Ok) {
            logger.error(`Ошибка при отправке сообщения: ${JSON.stringify(resp_message.Errors)}`);
            throw new Error(`SendMessage failed with errors: ${JSON.stringify(resp_message.Errors)}`);
        }
    } catch (error) {
        logger.error(`Ошибка при отправке сообщения: ${error.message}`);
        throw error;
    }
}

async function run() {
    // await sendMessage('Старт');

    const api = await createApi();

    // Получаем значение комментария
    const commentValue = getSlotValue(COMMENT);

    // Извлекаем username пользователя из Telegram-структуры !!!!!!
    const username = message?.message?.from?.username || message?.chat?.username || 'Неизвестный пользователь';

    // Выполняем POST-запрос
    const responsePost = await sendPostRequest(commentValue);
    if (responsePost?.error) {
        await sendMessage(`Ошибка при POST-запросе: ${responsePost.error}`);
        return;
    }

    // Выполняем GET-запрос
    const responseGet = await sendGetRequest(api);

    // Проверяем ответ сервера
    if (!responseGet || typeof responseGet !== 'string') {
        await sendMessage('Ответ сервера пустой или имеет некорректный формат.');
        return;
    }

    // Логируем полный ответ сервера
    logger.info(`Получен ответ от сервера: ${JSON.stringify(responseGet, null, 2)}`);

    // Формируем сообщение для чата
    const getResponseMessage = `Ответ сервера:\n${responseGet}\n\nПереданный комментарий:\n${commentValue}\n\nИмя пользователя Telegram:\n${username}`;

    // Отправляем сообщение в чат
    await sendMessage(getResponseMessage);
    //await sendMessage('Конец');
}

run()
    .then(() => {
        logger.info('Процесс завершён успешно.');
    })
    .catch((error) => {
        logger.error(`Ошибка в процессе выполнения: ${error.message}`);
    });