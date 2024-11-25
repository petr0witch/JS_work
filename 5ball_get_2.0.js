const BASE_URL = 'https://5ballov.russianpost.ru';
const ACCELERATION_URL = agentSettings.acceleration_url;
const AUTHORIZATION_TOKEN = agentSettings.authorization_token;
const COMMENT = agentSettings.comment;
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

async function createNewTaskGet(api) {
    //GET
    try {
        const response = await api.get('magic/api/cftalk.php');
         // Если сервер возвращает текст
        const serverMessage = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
       
        logger.info(`Respons (GET): ${serverMessage}`);
        return serverMessage;
    } catch (error) {
        logger.error(`Error (GET): ${JSON.stringify(error.response ? error.response.data : error.message)}`);
        return { error: error.response ? error.response.data : error.message };
    }
}

async function createNewTaskPost() {
    //POST
    try {
        const data = {
            ticket2: {
                comment: getSlotValue(COMMENT),
            },
        };

        logger.info(`Data (POST): ${JSON.stringify(data)}`);
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
        let cleanResponse = response.data;
        if (typeof cleanResponse === 'string') {
            cleanResponse = cleanResponse.replace(/[\n\r\t]+/g , '').trim();
            cleanResponse = cleanResponse.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, '').trim();
        }

        logger.info(`Response service 5ballov (POST): ${cleanResponse}`);
        return { response_5ballov_status: cleanResponse };
    } catch (error) {
        logger.error(`Error (POST): ${JSON.stringify(error.response ? error.response.data : error.message)}`);
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
        logger.error(`Произошла ошибка при отправке сообщения: ${error.message}`);
        throw error;
    }
}

async function run() {
    await sendMessage('Старт');

    const api = await createApi();

    // GET-запрос
    const responseGet = await createNewTaskGet(api);
    await sendMessage(`Response (GET): ${typeof responseGet === 'string' ? responseGet : JSON.stringify(responseGet)}`);

    // POST-запрос
    const responsePost = await createNewTaskPost();
    await sendMessage(`Response (POST): ${typeof responsePost === 'string' ? responsePost : JSON.stringify(responsePost)}`);

    await sendMessage('Конец');
}

run()
    .then(() => {
        logger.info('Процесс завершен успешно');
    })
    .catch((error) => {
        logger.error(`Произошла ошибка: ${error.message}`);
    });
