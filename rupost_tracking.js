const TRAKING_URL = agentSettings.trackingUrl;
const TRACK_NUMBER = message.slot_context.filled_slots.find(
    (slot) => slot.slot_id == "rupost_track_input"
)?.value;
const findLast = (array, predicate) => {
    let len = array.length;
    while (len--) {
        if (predicate(array[len])) return array[len];
    }
    return undefined;
};
const sendApiRequest = async () => {
    logger.info(`INCOMING TRACK NUMBER: ${TRACK_NUMBER}`);
    const url = TRAKING_URL.replace("[TRACK]", String(TRACK_NUMBER)?.toUpperCase());
    try {
        const response = await axios.get(url, {
            auth: { username: "craft-talk", password: "BbgV1UkS5w" },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });
        logger.info(`RESPONSE BODY: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (error) {
        logger.error(error);
        if (error.response) {
            logger.error(`Response error`);
            logger.error("Response data: " + JSON.stringify(error.response.data));
            logger.error("Response status: " + error.response.status);
            logger.error("Response headers: " + JSON.stringify(error.response.headers));
        } else if (error.request) {
            logger.error(`Request error`);
            logger.error("Request: " + JSON.stringify(error.request));
        } else if (error.message) {
            logger.error(`Message error`);
            logger.error("Message: " + error.message);
        }
        return { error: true, status: error?.response?.status };
    }
};
class Aggregator {
    data;
    constructor(data) {
        this.data = data;
    }
    fillField(params) {
        const { fieldName, value, altValue = "", defaultValue = "", expression } = params;
        if (expression === undefined)
            this.data[fieldName] =
                this.checkNullValue(value) ?? this.checkNullValue(altValue) ?? defaultValue;
        else
            this.data[fieldName] =
                this.checkNullValue(expression ? value : altValue) ?? defaultValue;
    }
    fillArray(params) {
        const { fieldName, value, altValue = "", defaultValue = "", expression } = params;
        if (expression === undefined)
            this.data[fieldName].push(
                this.checkNullValue(value) ?? this.checkNullValue(altValue) ?? defaultValue
            );
        else
            this.data[fieldName].push(
                this.checkNullValue(expression ? value : altValue) ?? defaultValue
            );
    }
    returnData() {
        return this.data;
    }
    checkNullValue(value) {
        return !!value ? value : null;
    }
}
const buildTrackData = (response) => {
    const noData = "noData";
    const unknown = "Неизвестно";
    let trackData = {
        operation_type: [],
        operation_attr: [],
        destination_address: "empty",
        destination_index: "empty",
        operation_address: [],
        operation_index: [],
        operation_date: [],
        country_dest: "empty",
        country_oper: "empty",
        country_from: "empty",
        ptype: "empty",
        type_id: "empty",
        category_id: "empty",
        rank: "empty",
        weight: "empty",
        transType: "empty",
        directCtg: "empty",
        interType: "empty",
    };
    if (!response || !response.historyRecords) {
        return trackData;
    }
    const aggregator = new Aggregator(trackData);
    let historyCount = response.historyRecords.length;
    try {
        response.historyRecords.map((item) => {
            aggregator.fillArray({
                fieldName: "operation_type",
                value: item.operType?.name,
                defaultValue: noData,
            });
            aggregator.fillArray({
                fieldName: "operation_attr",
                value: item.operAttr?.name,
                defaultValue: noData,
            });
            aggregator.fillArray({
                fieldName: "operation_address",
                value: item.indexOperDesc,
                defaultValue: noData,
            });
            aggregator.fillArray({
                fieldName: "operation_index",
                value: item.indexOper,
                defaultValue: noData,
            });
            aggregator.fillArray({
                fieldName: "operation_date",
                value: item.operDate,
                defaultValue: noData,
            });
        });
        aggregator.fillField({
            fieldName: "destination_address",
            value: response.historyRecords[0]?.indexToDesc,
            altValue: response.summary?.recipientAddress?.index?.opsName,
        });
        aggregator.fillField({
            fieldName: "destination_index",
            value: findLast(response.historyRecords, (elem) => !!elem.indexTo)?.indexTo,
            altValue: response.summary?.recipientAddress?.index?.id,
        });
        aggregator.fillField({
            fieldName: "country_dest",
            value: response.historyRecords[response.historyRecords.length - 1].mailDirect?.nameRu,
            altValue: response.historyRecords[0].mailDirect?.nameRu,
            defaultValue: unknown,
        });
        aggregator.fillField({
            fieldName: "country_oper",
            value: response.historyRecords[response.historyRecords.length - 1].countryOper?.nameRu,
            altValue: response.historyRecords[0].countryOper?.nameRu,
            defaultValue: unknown,
        });
        aggregator.fillField({
            fieldName: "country_from",
            value: response.historyRecords[response.historyRecords.length - 1].countryFrom?.nameRu,
            altValue: response.historyRecords[0].countryFrom?.nameRu,
            defaultValue: unknown,
        });
        aggregator.fillField({
            fieldName: "ptype",
            value: response?.summary?.mailType?.name,
            altValue: response.historyRecords[historyCount - 1]?.mailRank?.name,
        });
        aggregator.fillField({
            fieldName: "rank",
            value: response?.summary?.mailRank?.name,
            altValue: response.historyRecords[historyCount - 1]?.mailRank?.name,
        });
        aggregator.fillField({
            fieldName: "type_id",
            value: response.summary.mailType?.id,
            altValue: 0,
        });
        aggregator.fillField({
            fieldName: "category_id",
            value: response.summary.mailCtg?.id,
            altValue: 0,
        });
        aggregator.fillField({
            fieldName: "weight",
            value: response.summary?.weightInfo?.[response.summary.weightInfo.length - 1]?.value,
        });
        aggregator.fillField({
            fieldName: "transType",
            value: response.summary.transType?.id,
            altValue: 0,
        });
        aggregator.fillField({
            fieldName: "directCtg",
            value: response.summary.directCtg?.id,
            altValue: 0,
        });
        aggregator.fillField({
            fieldName: "interType",
            value: response.summary.interType?.id,
            altValue: 0,
        });
        return aggregator.returnData();
    } catch (e) {
        logger.info(`Build track data error: ${e}`);
    }
    return trackData;
};
const dateFormat = (date) => {
    if (!date && date.split("T").length !== 2) return "";
    const splitedDate = date.split("T");
    return `${splitedDate[0].split("-").reverse().join(".")} ${splitedDate[1].slice(0, 8)}`;
};
const countDiffDaysFromToday = (date) => {
    if (!date) return 0;
    const today = new Date().getTime();
    const timeDiff = Math.abs(today - new Date(date).getTime());
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
};
const getChannelName = (channelId) => {
    if (!agentSettings.channelsNames) return "";
    for (let key of Object.keys(agentSettings.channelsNames)) {
        let channelName = agentSettings.channelsNames[key].find((id) => id === channelId);
        if (channelName) {
            return key;
        }
    }
    return "";
};
const checkDaysOnSort = (attr, days) => (attr === "Сортировка" ? String(days) : "");
const getMoneyInfo = (moneyInfo, moneyTypeName) => {
    if (!Array.isArray(moneyInfo)) return 0;
    const moneyObject = moneyInfo.find(
        (e) => e?.moneyType?.name.toLowerCase() === moneyTypeName.toLowerCase()
    );
    return moneyObject?.value ?? 0;
};
const fillSlots = (trackResponse) => {
    let slots = {};
    slots.rupost_start_tracking = dateFormat(new Date().toISOString());
    slots.rupost_channel_name = getChannelName(message?.channel?.channel_id);
    slots.rupost_dialog_id = message.user?.session_id;
    if (!trackResponse || !trackResponse.historyRecords) {
        logger.info(`No data or history: ${JSON.stringify(trackResponse)}`);
        return slots;
    }
    slots.rupost_user_phone = trackResponse?.summary?.phoneRecipient ?? "";
    slots.rupost_hid =
        trackResponse.historyRecords.find((hist) => hist.senderPersonInfo?.hid)?.senderPersonInfo
            .hid ?? "";
    slots.rupost_date_last = dateFormat(
        trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operDate
    );
    slots.rupost_days_in_last_status =
        "" +
        countDiffDaysFromToday(
            trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operDate
        );
    slots.rupost_mail_type = trackResponse?.summary?.mailType?.name ?? "";
    slots.rupost_mail_category = trackResponse?.summary?.mailCtg?.name ?? "";
    slots.rupost_operation_type =
        trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operType?.name ?? "";
    slots.rupost_operation_attr =
        trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operAttr?.name ?? "";
    slots.rupost_last_operation_index =
        trackResponse.historyRecords[trackResponse.historyRecords.length - 1].indexOper ?? "";
    slots.rupost_weight = !!trackResponse.summary.weightInfo
        ? String(
              trackResponse.summary.weightInfo[trackResponse.summary.weightInfo.length - 1]?.value
          )
        : "";
    slots.rupost_sender_address = `${
        trackResponse.historyRecords[0].senderAddress?.address?.region ?? ""
    } ${trackResponse.historyRecords[0].senderAddress?.address?.area ?? ""} ${
        trackResponse.historyRecords[0].senderAddress?.address?.place ?? ""
    } ${trackResponse.historyRecords[0].senderAddress?.address?.street ?? ""}`;
    slots.rupost_sender_index = trackResponse.historyRecords[0].indexOper;
    slots.stop_channel_name = "Чат бот";
    slots.stop_mail_type = `${trackResponse?.summary?.mailType?.name ?? ""} ${
        trackResponse?.summary?.mailCtg?.name ?? ""
    }`;
    slots.stop_track_topic = agentSettings.stop_track_topic;
    slots.stop_unit = agentSettings.stop_unit;
    slots.rupost_money_info_cash_on_del = getMoneyInfo(
        trackResponse?.summary?.moneyInfo,
        agentSettings.rupost_money_info_cash_on_del
    );
    slots.rupost_money_info_price = getMoneyInfo(
        trackResponse?.summary?.moneyInfo,
        agentSettings.rupost_money_info_price
    );
    slots.rupost_days_on_sort = checkDaysOnSort(
        trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operAttr?.name,
        countDiffDaysFromToday(
            trackResponse.historyRecords[trackResponse.historyRecords.length - 1].operDate
        )
    );
    slots.rupost_deliv_status = "";
    return slots;
};
const main = async () => {
    const result = await sendApiRequest();
    if (!result || (!!result?.error && +result?.status !== 400)) {
        logger.error(`TRACK DATA IS EMPTY 503 with track number: ${TRACK_NUMBER?.toUpperCase()}`);
        resolve([
            agentApi.makeTextReply(
                `/switchredirect aiassist2 intent_id="${agentSettings.replyForError}"`,
                undefined,
                undefined,
                {}
            ),
        ]);
    } else {
        const trackData = buildTrackData(result);
        const JsonTrackData = JSON.stringify(trackData);
        logger.info(`trackData: ${JsonTrackData}`);
        const slots = fillSlots(result);
        logger.info(`slots: ${JSON.stringify(slots)}`);
        resolve([
            agentApi.makeTextReply(
                `/switchredirect aiassist2 intent_id="${agentSettings.redirectTo}"`,
                undefined,
                undefined,
                {
                    track_data: JsonTrackData,
                    ...JSON.parse(JSON.stringify(slots)),
                }
            ),
        ]);
    }
};
main()
    .then((res) => {
        logger.info(`Success executing main func.`);
    })
    .catch((error) => {
        logger.info(`Some error when executing main func. ${error}`);
        resolve([
            agentApi.makeTextReply(
                `/switchredirect aiassist2 intent_id="${agentSettings.replyForError}"`,
                undefined,
                undefined,
                {}
            ),
        ]);
    });