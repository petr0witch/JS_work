const ACCELERATION_URL = agentSettings.acceleration_url
const AUTHORIZATION_TOKEN = agentSettings.authorization_token
const RP_INTEGRATION_KEY = agentSettings.RPIntegrationKey
const TOPIC = agentSettings.topic
const BARCODE = agentSettings.barcode
const FIO_ZAIKI = agentSettings.fiozaiki
const FROM_INDEX = agentSettings.fromindex
const COMMENT = agentSettings.comment
const REQUEST_BAD_REDIRECT_TO = agentSettings.requestBadRedirectTo
const REQUEST_SUCCESSFULLY_REDIRECT_TO = agentSettings.requestSuccessfullyRedirectTo
axios.defaults.timeout = agentSettings.timeout
// возьми знач из доп настроек
const getSlotValue = (slotId) => message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value

async function createNewTask() {
    try {
        const data = {
            ticket2: {
                RPIntegrationKey: getSlotValue(RP_INTEGRATION_KEY),
                topic: getSlotValue(TOPIC),
                barcode: getSlotValue(BARCODE),
                fiozaiki: getSlotValue(FIO_ZAIKI),
                fromindex: getSlotValue(FROM_INDEX),
                comment: getSlotValue(COMMENT)
            }
        }
        logger.info(`DATA ${JSON.stringify(data)}`)
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTHORIZATION_TOKEN
            },
            httpsAgent: new https.Agent({ //игнор защиты
                secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
                rejectUnauthorized: false
            })
        }
        if (!data.ticket2.barcode || data.ticket2.barcode === ''
            || !data.ticket2.fromindex || data.ticket2.fromindex === '') {
            logger.info(`There are no fields in the request: barcode or from inside`)
            return [
                agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${REQUEST_BAD_REDIRECT_TO}"`),
            ]
        } else {
            const response = await axios.post(ACCELERATION_URL, data, config)
            logger.info(`Response service 5ballov: ${JSON.stringify(response.data)}`)
            const slots= {
                resopnse_5ballov_status: response.data
            }
            return [
                agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${REQUEST_SUCCESSFULLY_REDIRECT_TO}"`,
                    undefined,
                    undefined,
                    {
                    ...JSON.parse(JSON.stringify(slots)),
                }),
            ]
        } 
    } catch (error) {
        logger.error(`Error: ${JSON.stringify(error.response ? error.response.data : error.message)}`)
        return {'error': error.response ? error.response.data : error.message}
    }
}

async function run() {
    logger.info(`start script`)
    logger.info(`message ${JSON.stringify(message.slot_context.filled_slots)}`)
    return await createNewTask()
}

run()
    .then(response => {
        logger.info(`Successfully ${JSON.stringify(response)}`)
        resolve(response)
    })
    .catch(error => {
        logger.error(`An error has occurred: ${error.message}`)
    })