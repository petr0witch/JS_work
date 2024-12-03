const ACCELERATION_URL = agentSettings.acceleration_url;
const AUTHORIZATION_TOKEN = agentSettings.authorization_token;
const COMMENT = agentSettings.comment;
const SYS_FIRSTNAME = agentSettings.sys_firstname;
const SYS_LASTNAME = agentSettings.sys_lastname;
axios.defaults.timeout = agentSettings.timeout;


// Создаём HTTPS агент для повторного использования
const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false,
});

// Создание и настройка axios инстанса
const axiosInstance = axios.create({
    baseURL: ACCELERATION_URL,
    timeout: 30000,
    httpsAgent,
    headers: {
        'Content-Type': 'application/json',
        Authorization: AUTHORIZATION_TOKEN,
    },
});

//
const config = {
    timeout:1000
};

const getSlotValue = (slotId) =>
    message.slot_context?.filled_slots?.find((slot) => slot.slot_id === slotId)?.value || '';
const userdata = getSlotValue(SYS_FIRSTNAME) + " " + getSlotValue(SYS_LASTNAME);
const commentValue = getSlotValue(COMMENT);

// POST-запрос
async function sendPostRequest(comment, userdata) {
    const data = { comment, userdata };
    // Выполняем POST-запрос
    try {
        const response = await axiosInstance.post('', data, config); // `''` использует `baseURL`
        await sendMessage(response.data); // то что постим
        logger.info(`POST-запрос отправлен: ${JSON.stringify(response.data)}`);
        return response.data; // Возвращаем ответ
    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        logger.error(`Ошибка при POST-запросе: ${JSON.stringify(errorMessage)}`);
        return { error: errorMessage };
    }
}

// Функция отправки сообщения
async function sendMessage(reply) {
    try {
        const respMessage = await agentApi.sendMessage(
            {
                MessageMarkdown: typeof reply === 'string' ? reply : JSON.stringify(reply), // Преобразуем объект в строку
                SendMessageParams: {
                    ProjectId: message.user?.customer_id || message.channel?.customer_id,
                    OmniUserId: message.user?.omni_user_id,
                    Sender: {},
                    FilledSlots: {},
                },
            },
            logger
        );

        if (!respMessage.Ok) {
            const errorDetails = JSON.stringify(respMessage.Errors);
            logger.error(`Ошибка при отправке сообщения: ${errorDetails}`);
            throw new Error(`SendMessage failed: ${errorDetails}`);
        }
    } catch (error) {
        logger.error(`Ошибка при отправке сообщения: ${error.message}`);
        throw error;
    }
}

// Основная логика
async function run() {
    const responsePost = await sendPostRequest(commentValue, userdata);
    if (responsePost?.error) {
        await sendMessage(`Ошибка при POST-запросе: ${responsePost.error}`);
        return;
    }
}

run()
    .then(() => {
        logger.info('Процесс завершён успешно.');
    })
    .catch((error) => {
        logger.error(`Ошибка в процессе выполнения: ${error.message}`);
    });
