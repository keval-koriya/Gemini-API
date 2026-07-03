import { AvailableModel } from "./types/availablemodel.js";
import { ChatMixin, GemMixin, ResearchMixin } from './components/index.js';
import { Model, AccountStatus, GRPC, Endpoint, Headers, STREAMING_FLAG_INDEX, GEM_FLAG_INDEX, TEMPORARY_CHAT_FLAG_INDEX, DEFAULT_METADATA } from './constants.js';
import { APIError, AuthError, GeminiError, ModelInvalid, TemporarilyBlocked, TimeoutError, UsageLimitExceeded } from './exceptions.js';
import { ModelOutput, Candidate, DeepResearchPlan, WebImage, GeneratedImage, GeneratedVideo, GeneratedMedia, ChatInfo } from './types/index.js';
import { getAccessToken, rotate1psidts, uploadFile, parseFileName, extractDeepResearchPlan, getNestedValue, logger, running } from './utils/index.js';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// Mixin composition helper
function applyMixins(derivedCtor: any, constructors: any[]) {
    constructors.forEach((baseCtor) => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
            if (name !== 'constructor') {
                Object.defineProperty(
                    derivedCtor.prototype,
                    name,
                    Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
                    Object.create(null)
                );
            }
        });
    });
}

export class ChatSession {
    __metadata: (string | null)[];
    geminiclient: GeminiClient;
    lastOutput: ModelOutput | null;
    model: Model | any;
    gem: any;

    constructor(
        geminiclient: GeminiClient,
        metadata: (string | null)[] | null = null,
        cid: string = "",
        rid: string = "",
        rcid: string = "",
        model: Model | any = Model.UNSPECIFIED,
        gem: any = null
    ) {
        this.__metadata = [...DEFAULT_METADATA];
        this.geminiclient = geminiclient;
        this.lastOutput = null;
        this.model = model;
        this.gem = gem;

        if (metadata) this.metadata = metadata;
        if (cid) this.cid = cid;
        if (rid) this.rid = rid;
        if (rcid) this.rcid = rcid;
    }

    get metadata(): (string | null)[] { return this.__metadata; }
    set metadata(value: (string | null)[]) {
        for (let i = 0; i < value.length; i++) {
            if (i < 10 && value[i] !== null) {
                this.__metadata[i] = value[i];
            }
        }
    }

    get cid(): string { return this.__metadata[0] || ""; }
    set cid(value: string) { this.__metadata[0] = value; }

    get rid(): string { return this.__metadata[1] || ""; }
    set rid(value: string) { this.__metadata[1] = value; }

    get rcid(): string { return this.__metadata[2] || ""; }
    set rcid(value: string) { this.__metadata[2] = value; }

    async sendMessage(
        prompt: string,
        kwargs: any = {}
    ): Promise<ModelOutput> {
        const { files, temporary = false, deepResearch = false, ...rest } = kwargs;
        return await this.geminiclient.generateContent(
            prompt,
            files,
            this.model,
            this.gem,
            this,
            temporary,
            deepResearch,
            rest
        );
    }
}

export interface GeminiClient extends ChatMixin, GemMixin, ResearchMixin {}

export class GeminiClient {
    proxy: string | null;
    client: AxiosInstance | null;
    accessToken: string | null;
    buildLabel: string | null;
    sessionId: string | null;
    language: string;
    pushId: string | null;
    accountStatus: AccountStatus;
    timeout: number;
    autoClose: boolean;
    closeDelay: number;
    closeTask: any;
    autoRefresh: boolean;
    refreshInterval: number;
    refreshTask: any;
    watchdogTimeout: number;
    verbose: boolean;
    _running: boolean;
    _cookies: Record<string, string>;
    _reqid: number;
    _modelRegistry: Record<string, AvailableModel>;
    kwargs: any;

    constructor(
        secure1psid: string | null = null,
        secure1psidts: string | null = null,
        proxy: string | null = null,
        kwargs: any = {}
    ) {
        this.proxy = proxy;
        this.client = null;
        this.accessToken = null;
        this.buildLabel = null;
        this.sessionId = null;
        this.language = "en";
        this.pushId = null;
        this.accountStatus = AccountStatus.AVAILABLE;
        this.timeout = 450;
        this.autoClose = false;
        this.closeDelay = 450;
        this.closeTask = null;
        this.autoRefresh = true;
        this.refreshInterval = 600;
        this.refreshTask = null;
        this.watchdogTimeout = 120;
        this.verbose = false;
        this._running = false;
        this._cookies = {};
        this._reqid = Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;
        this._modelRegistry = {};
        this.kwargs = kwargs;

        if (secure1psid) {
            this._cookies["__Secure-1PSID"] = secure1psid;
            if (secure1psidts) {
                this._cookies["__Secure-1PSIDTS"] = secure1psidts;
            }
        }

        // Initialize mixins properties
        this._recentChats = null;
        this._gems = null;
    }

    get cookies(): Record<string, string> {
        return this._cookies;
    }

    set cookies(value: Record<string, string>) {
        this._cookies = { ...this._cookies, ...value };
    }

    async init(
        timeout: number = 450,
        autoClose: boolean = false,
        closeDelay: number = 450,
        autoRefresh: boolean = true,
        refreshInterval: number = 600,
        watchdogTimeout: number = 120,
        verbose: boolean = false
    ): Promise<void> {
        if (this._running) return;

        try {
            this.verbose = verbose;
            this.watchdogTimeout = watchdogTimeout;

            const [accessToken, buildLabel, sessionId, language, pushId, session, newCookies] = await getAccessToken(
                this._cookies,
                this.proxy,
                this.verbose,
                this.kwargs.verify !== false
            );

            this.client = session;
            this._cookies = { ...this._cookies, ...newCookies };
            this.accessToken = accessToken;
            this.buildLabel = buildLabel;
            this.sessionId = sessionId;
            this.language = language || "en";
            this.pushId = pushId || "feeds/mcudyrk2a4khkz";
            this._running = true;
            this._reqid = Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;

            this.timeout = timeout;
            this.autoClose = autoClose;
            this.closeDelay = closeDelay;
            if (this.autoClose) {
                this.resetCloseTask();
            }

            this.autoRefresh = autoRefresh;
            this.refreshInterval = refreshInterval;

            if (this.refreshTask) {
                clearTimeout(this.refreshTask);
                this.refreshTask = null;
            }

            if (this.autoRefresh) {
                this.startAutoRefresh();
            }

            await this._initRpc();

            logger.info("Gemini client initialized successfully.");
        } catch (e) {
            await this.close();
            throw e;
        }
    }

    async close(delay: number = 0): Promise<void> {
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }

        this._running = false;

        if (this.closeTask) {
            clearTimeout(this.closeTask);
            this.closeTask = null;
        }

        if (this.refreshTask) {
            clearTimeout(this.refreshTask);
            this.refreshTask = null;
        }

        this.client = null;
    }

    resetCloseTask(): void {
        if (this.closeTask) {
            clearTimeout(this.closeTask);
        }
        this.closeTask = setTimeout(() => this.close(), this.closeDelay * 1000);
    }

    startAutoRefresh(): void {
        if (this.refreshInterval < 60) this.refreshInterval = 60;

        const loop = async () => {
            if (!this._running) return;
            try {
                if (this.client) {
                    const new1psidts = await rotate1psidts(this.client, this._cookies, this.verbose);
                    if (!new1psidts) {
                        logger.warn("Rotation response did not contain a __Secure-1PSIDTS.");
                    } else {
                        this._cookies["__Secure-1PSIDTS"] = new1psidts;
                    }
                }
            } catch (e: any) {
                if (e instanceof AuthError) {
                    logger.warn("AuthError: Failed to refresh cookies.");
                } else {
                    logger.warn(`Unexpected error while refreshing cookies: ${e}`);
                }
            }

            if (this._running) {
                this.refreshTask = setTimeout(loop, this.refreshInterval * 1000);
            }
        };

        this.refreshTask = setTimeout(loop, this.refreshInterval * 1000);
    }

    async _initRpc(): Promise<void> {
        await this._fetchUserStatus();
        await this._sendBardSettings();
        await this._sendBardActivity();
        await this._fetchRecentChats();
    }

    async _fetchUserStatus(): Promise<void> {
        const response = await this._batchExecute([
            { rpcid: GRPC.GET_USER_STATUS, payload: "[]", identifier: "generic" }
        ]);

        let text = response.data;
        if (text.startsWith(")]}'")) text = text.substring(4).trim();
        let responseJson;
        try {
            responseJson = JSON.parse(text);
        } catch { return; }

        for (const part of responseJson) {
            const partBodyStr = getNestedValue(part, [2]);
            if (!partBodyStr) continue;

            const partBody = JSON.parse(partBodyStr);
            const statusCode = getNestedValue(partBody, [14]);
            this.accountStatus = statusCode === 1000 ? AccountStatus.AVAILABLE : (statusCode || AccountStatus.ACCOUNT_REJECTED);

            if (this.accountStatus !== AccountStatus.AVAILABLE) {
                logger.warn(`Account status: ${this.accountStatus}`);
                if ([AccountStatus.LOCATION_REJECTED, AccountStatus.ACCOUNT_REJECTED, AccountStatus.ACCESS_TEMPORARILY_UNAVAILABLE, AccountStatus.ACCOUNT_REJECTED_BY_GUARDIAN, AccountStatus.GUARDIAN_APPROVAL_REQUIRED].includes(this.accountStatus)) {
                    continue;
                }
            }

            const modelsList = getNestedValue(partBody, [15]);
            if (Array.isArray(modelsList)) {
                const tierFlags = getNestedValue(partBody, [16], []);
                const capabilityFlags = getNestedValue(partBody, [17], []);
                const [capacity, capacityField] = AvailableModel.computeCapacity(tierFlags, capabilityFlags);
                const idNameMapping = AvailableModel.buildModelIdNameMapping();

                for (const modelData of modelsList) {
                    if (Array.isArray(modelData)) {
                        const modelId = getNestedValue(modelData, [0], "");
                        const displayName = getNestedValue(modelData, [1], "");
                        const description = getNestedValue(modelData, [2], "");

                        if (modelId && displayName) {
                            let isModelAvailable = true;
                            if (this.accountStatus === AccountStatus.UNAUTHENTICATED) {
                                if (modelId !== Model.BASIC_FLASH.modelId) {
                                    isModelAvailable = false;
                                }
                            }

                            const model = new AvailableModel(
                                modelId,
                                idNameMapping[modelId] || "",
                                displayName,
                                description,
                                capacity,
                                capacityField,
                                isModelAvailable
                            );
                            this._modelRegistry[modelId] = model;
                        }
                    }
                }
                return;
            }
        }
    }

    async _sendBardSettings(): Promise<void> {
        await this._batchExecute([
            {
                rpcid: GRPC.BARD_SETTINGS,
                payload: '[[["adaptive_device_responses_enabled","advanced_mode_theme_override_triggered","advanced_zs_upsell_dismissal_count","advanced_zs_upsell_last_dismissed","ai_transparency_notice_dismissed","audio_overview_discovery_dismissal_count","audio_overview_discovery_last_dismissed","bard_in_chrome_link_sharing_enabled","bard_sticky_mode_disabled_count","canvas_create_discovery_tooltip_seen_count","combined_files_button_tag_seen_count","indigo_banner_explicit_dismissal_count","indigo_banner_impression_count","indigo_banner_last_seen_sec","current_popup_id","deep_research_has_seen_file_upload_tooltip","deep_research_model_update_disclaimer_display_count","default_bot_id","disabled_discovery_card_feature_ids","disabled_model_discovery_tooltip_feature_ids","disabled_mode_disclaimers","disabled_new_model_badge_mode_ids","disabled_settings_discovery_tooltip_feature_ids","disablement_disclaimer_last_dismissed_sec","disable_advanced_beta_dialog","disable_advanced_beta_non_en_banner","disable_advanced_resubscribe_ui","disable_at_mentions_discovery_tooltip","disable_autorun_fact_check_u18","disable_bot_create_tips_card","disable_bot_docs_in_gems_disclaimer","disable_bot_onboarding_dialog","disable_bot_save_reminder_tips_card","disable_bot_send_prompt_tips_card","disable_bot_shared_in_drive_disclaimer","disable_bot_try_create_tips_card","disable_colab_tooltip","disable_collapsed_tool_menu_tooltip","disable_continue_discovery_tooltip","disable_debug_info_moved_tooltip_v2","disable_enterprise_mode_dialog","disable_export_python_tooltip","disable_extensions_discovery_dialog","disable_extension_one_time_badge","disable_fact_check_tooltip_v2","disable_free_file_upload_tips_card","disable_generated_image_download_dialog","disable_get_app_banner","disable_get_app_desktop_dialog","disable_googler_in_enterprise_mode","disable_human_review_disclosure","disable_ice_open_vega_editor_tooltip","disable_image_upload_tooltip","disable_legal_concern_tooltip","disable_llm_history_import_disclaimer","disable_location_popup","disable_memory_discovery","disable_memory_extraction_discovery","disable_new_conversation_dialog","disable_onboarding_experience","disable_personal_context_tooltip","disable_photos_upload_disclaimer","disable_power_up_intro_tooltip","disable_scheduled_actions_mobile_notification_snackbar","disable_storybook_listen_button_tooltip","disable_streaming_settings_tooltip","disable_take_control_disclaimer","disable_teens_only_english_language_dialog","disable_tier1_rebranding_tooltip","disable_try_advanced_mode_dialog","enable_advanced_beta_mode","enable_advanced_mode","enable_googler_in_enterprise_mode","enable_memory","enable_memory_extraction","enable_personal_context","enable_personal_context_gemini","enable_personal_context_gemini_using_photos","enable_personal_context_gemini_using_workspace","enable_personal_context_search","enable_personal_context_youtube","enable_token_streaming","enforce_default_to_fast_version","mayo_discovery_banner_dismissal_count","mayo_discovery_banner_last_dismissed_sec","gempix_discovery_banner_dismissal_count","gempix_discovery_banner_last_dismissed","get_app_banner_ack_count","get_app_banner_seen_count","get_app_mobile_dialog_ack_count","guided_learning_banner_dismissal_count","guided_learning_banner_last_dismissed","has_accepted_agent_mode_fre_disclaimer","has_received_streaming_response","has_seen_agent_mode_tooltip","has_seen_bespoke_tooltip","has_seen_deepthink_mustard_tooltip","has_seen_deepthink_v2_tooltip","has_seen_deep_think_tooltip","has_seen_first_youtube_video_disclaimer","has_seen_ggo_tooltip","has_seen_image_grams_discovery_banner","has_seen_image_preview_in_input_area_tooltip","has_seen_kallo_discovery_banner","has_seen_kallo_tooltip","has_seen_model_picker_in_input_area_tooltip","has_seen_model_tooltip_in_input_area_for_gempix","has_seen_redo_with_gempix2_tooltip","has_seen_veograms_discovery_banner","has_seen_video_generation_discovery_banner","is_imported_chats_panel_open_by_default","jumpstart_onboarding_dismissal_count","last_dismissed_deep_research_implicit_invite","last_dismissed_discovery_feature_implicit_invites","last_dismissed_immersives_canvas_implicit_invite","last_dismissed_immersive_share_disclaimer_sec","last_dismissed_strike_timestamp_sec","last_dismissed_zs_student_aip_banner_sec","last_get_app_banner_ack_timestamp_sec","last_get_app_mobile_dialog_ack_timestamp_sec","last_human_review_disclosure_ack","last_selected_mode_id_in_embedded","last_selected_mode_id_on_web","last_two_up_activation_timestamp_sec","last_winter_olympics_interaction_timestamp_sec","memory_extracted_greeting_name","mini_gemini_tos_closed","mode_switcher_soft_badge_disabled_ids","mode_switcher_soft_badge_seen_count","personalization_first_party_onboarding_cross_surface_clicked","personalization_first_party_onboarding_cross_surface_seen_count","personalization_one_p_discovery_card_seen_count","personalization_one_p_discovery_last_consented","personalization_zero_state_card_last_interacted","personalization_zero_state_card_seen_count","popup_zs_visits_cooldown","require_reconsent_setting_for_personalization_banner_seen_count","show_debug_info","side_nav_open_by_default","student_verification_dismissal_count","student_verification_last_dismissed","task_viewer_cc_banner_dismissed_count","task_viewer_cc_banner_dismissed_time_sec","tool_menu_new_badge_disabled_ids","tool_menu_new_badge_impression_counts","tool_menu_soft_badge_disabled_ids","tool_menu_soft_badge_impression_counts","upload_disclaimer_last_consent_time_sec","viewed_student_aip_upsell_campaign_ids","voice_language","voice_name","web_and_app_activity_enabled","wellbeing_nudge_notice_last_dismissed_sec","zs_student_aip_banner_dismissal_count"]]]',
                identifier: "generic"
            }
        ]);
    }

    async _sendBardActivity(): Promise<void> {
        await this._batchExecute([
            { rpcid: GRPC.BARD_SETTINGS, payload: '[[["bard_activity_enabled"]]]', identifier: "generic" }
        ]);
    }

    async _batchExecute(payloads: any[], kwargs: any = {}): Promise<any> {
    const wrappedExecute = async (payloads: any[], kwargs: any = {}) => {
        const reqid = this._reqid;
        this._reqid += 100000;

        let cookieStr = '';
        if (this._cookies) {
            cookieStr = Object.entries(this._cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        }

        try {
            const params = new URLSearchParams();
            params.append('rpcids', payloads.map(p => p.rpcid).join(','));
            params.append('hl', this.language);
            params.append('_reqid', reqid.toString());
            params.append('rt', 'c');
            params.append('source-path', kwargs.sourcePath || '/app');

            if (this.buildLabel) params.append('bl', this.buildLabel);
            if (this.sessionId) params.append('f.sid', this.sessionId);

            const formData = new URLSearchParams();
            formData.append("at", this.accessToken || "");
            formData.append("f.req", JSON.stringify([payloads.map(p => [p.rpcid, p.payload, null, p.identifier])]));

            const response = await this.client!.post(Endpoint.BATCH_EXEC + '?' + params.toString(), formData.toString(), {
                headers: {
                    ...Headers.GEMINI,
                    ...Headers.BATCH_EXEC,
                    ...Headers.SAME_DOMAIN,
                    Cookie: cookieStr
                },
                validateStatus: () => true
            });

            if (this.verbose) {
                logger.debug(`HTTP Request: POST ${Endpoint.BATCH_EXEC} [${response.status}]`);
            }

            if (response.status !== 200) {
                if (kwargs.closeOnError !== false) {
                    await this.close();
                }
                throw new APIError(`Batch execution failed with status code ${response.status}`);
            }

            return response;
        } catch (e: any) {
            throw new TimeoutError(`The request timed out: ${e.message}`);
        }
    };

    let attempt = 0;
    while (attempt < 2) {
        try {
            return await wrappedExecute(payloads, kwargs);
        } catch (error) {
            attempt++;
            if (attempt >= 2) throw error;
            logger.debug(`[Retry] Attempt ${attempt} failed. Retrying...`);
        }
    }
}

    startChat(kwargs: any = {}): ChatSession {
        return new ChatSession(this, kwargs.metadata, kwargs.cid, kwargs.rid, kwargs.rcid, kwargs.model, kwargs.gem);
    }


    _parseCandidate(candidateData: any, cid: string, rid: string, rcid: string): [string, string, WebImage[], GeneratedImage[], GeneratedVideo[], GeneratedMedia[]] {
        const CARD_CONTENT_RE = /^http:\/\/googleusercontent\.com\/card_content\/\d+/;
        const ARTIFACTS_RE = /http:\/\/googleusercontent\.com\/\w+\/\d+\n*/g;

        let text = getNestedValue(candidateData, [1, 0], "");
        if (CARD_CONTENT_RE.test(text)) {
            text = getNestedValue(candidateData, [22, 0]) || text;
        }
        text = text.replace(ARTIFACTS_RE, "");

        const thoughts = getNestedValue(candidateData, [37, 0, 0]) || "";

        const webImages: WebImage[] = [];
        const webImageArray = getNestedValue(candidateData, [12, 1], []);
        for (let i = 0; i < webImageArray.length; i++) {
            const url = getNestedValue(webImageArray[i], [0, 0, 0]);
            if (url) {
                webImages.push(new WebImage(
                    url,
                    `[Image ${i + 1}]`,
                    getNestedValue(webImageArray[i], [0, 4], ""),
                    this.proxy,
                    null
                ));
            }
        }

        const generatedImages: GeneratedImage[] = [];
        const plainGen = getNestedValue(candidateData, [12, 7, 0], []);
        const imgToImg = getNestedValue(candidateData, [12, 0, "8", 0], []);
        const allGenImages = [...plainGen, ...imgToImg];

        for (let i = 0; i < allGenImages.length; i++) {
            const genImgData = allGenImages[i];
            const url = getNestedValue(genImgData, [0, 3, 3]);
            if (url) {
                const imageId = getNestedValue(genImgData, [1, 0]) || `http://googleusercontent.com/image_generation_content/${i}`;
                generatedImages.push(new GeneratedImage(
                    url,
                    `[Generated Image ${i}]`,
                    getNestedValue(genImgData, [0, 3, 2], ""),
                    this.proxy,
                    null,
                    this,
                    cid,
                    rid,
                    rcid,
                    imageId
                ));
            }
        }

        const generatedVideos: GeneratedVideo[] = [];
        const videoInfo = getNestedValue(candidateData, [12, 59, 0, 0, 0], []);
        if (videoInfo) {
            const urls = getNestedValue(videoInfo, [0, 7], []);
            if (urls.length >= 2) {
                generatedVideos.push(new GeneratedVideo(
                    urls[1],
                    "[Video]",
                    this.proxy,
                    null,
                    this,
                    urls[0],
                    cid,
                    rid,
                    rcid
                ));
            }
        }

        const generatedMedia: GeneratedMedia[] = [];
        const mediaData = getNestedValue(candidateData, [12, 86], []);
        if (mediaData) {
            let mp3Url = "";
            let mp3Thumb = "";
            const mp3List = getNestedValue(mediaData, [0, 1, 7], []);
            if (mp3List.length >= 2) {
                mp3Thumb = mp3List[0];
                mp3Url = mp3List[1];
            }

            let mp4Url = "";
            let mp4Thumb = "";
            const mp4List = getNestedValue(mediaData, [1, 1, 7], []);
            if (mp4List.length >= 2) {
                mp4Thumb = mp4List[0];
                mp4Url = mp4List[1];
            }

            if (mp3Url || mp4Url) {
                generatedMedia.push(new GeneratedMedia(
                    mp4Url,
                    "[Media]",
                    this.proxy,
                    null,
                    this,
                    mp4Thumb,
                    cid,
                    rid,
                    rcid,
                    mp3Url,
                    mp3Thumb
                ));
            }
        }

        return [text, thoughts, webImages, generatedImages, generatedVideos, generatedMedia];
    }

    async generateContent(
        prompt: string,
        files: any[] | null = null,
        model: Model | any = Model.UNSPECIFIED,
        gem: any = null,
        chat: ChatSession | null = null,
        temporary: boolean = false,
        deepResearch: boolean = false,
        kwargs: any = {}
    ): Promise<ModelOutput> {
        let output: ModelOutput | null = null;
        for await (const chunk of this.generateContentStream(prompt, files, model, gem, chat, temporary, deepResearch, kwargs)) {
            output = chunk;
        }

        if (!output) {
            throw new GeminiError("Failed to generate contents. No output data found in response.");
        }

        if (chat) {
            output.metadata = chat.metadata as string[];
            chat.lastOutput = output;
        }

        return output;
    }

    async *generateContentStream(
        prompt: string,
        files: any[] | null = null,
        model: Model | any = Model.UNSPECIFIED,
        gem: any = null,
        chat: ChatSession | null = null,
        temporary: boolean = false,
        deepResearch: boolean = false,
        kwargs: any = {}
    ): AsyncGenerator<ModelOutput, void, unknown> {
        if (!prompt) {
            throw new Error("Prompt cannot be empty.");
        }

        let resolvedModel = model;
        if (typeof model === 'string') {
            resolvedModel = this._modelRegistry[model] || Model.fromName(model);
        }

        this._reqid += 100000;

        let reqFileData: any[] | null = null;
        if (files) {
            await this._sendBardActivity();
            const uploadPromises = files.map(file => uploadFile(file, this.client!, this.pushId || ""));
            const uploadedUrls = await Promise.all(uploadPromises);
            reqFileData = uploadedUrls.map((url, i) => [[[url], parseFileName(files[i])]]);
        }

        await this._sendBardActivity();

        const messageContent = [prompt, 0, null, reqFileData, null, null, 0];

        const innerReqList: any[] = Array(69).fill(null);
        innerReqList[0] = messageContent;
        innerReqList[1] = [this.language];
        innerReqList[2] = chat ? chat.metadata : DEFAULT_METADATA;
        if (deepResearch) {
            innerReqList[3] = "!" + uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''); // fake token
            innerReqList[4] = uuidv4().replace(/-/g, '');
        }
        innerReqList[6] = [1];
        innerReqList[STREAMING_FLAG_INDEX] = 1;
        innerReqList[10] = 1;
        innerReqList[11] = 0;
        innerReqList[17] = [[0]];
        innerReqList[18] = 0;
        if (gem) {
            innerReqList[GEM_FLAG_INDEX] = typeof gem === 'string' ? gem : gem.id;
        }
        innerReqList[27] = 1;
        innerReqList[30] = [4];
        innerReqList[41] = [1];
        if (temporary) innerReqList[TEMPORARY_CHAT_FLAG_INDEX] = 1;
        if (deepResearch) innerReqList[49] = 1;
        innerReqList[53] = 0;
        if (deepResearch) {
            innerReqList[54] = [[[[[1]]]]];
            innerReqList[55] = [[1]];
        }
        innerReqList[61] = [];
        innerReqList[68] = 2;

        const uuidVal = uuidv4().toUpperCase();
        innerReqList[59] = uuidVal;

        let cookieStr = '';
        if (this._cookies) {
            cookieStr = Object.entries(this._cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        }

        const requestHeaders = {
            ...Headers.GEMINI,
            ...resolvedModel.modelHeader,
            "x-goog-ext-525005358-jspb": `["${uuidVal}",1]`,
            ...Headers.SAME_DOMAIN,
            Cookie: cookieStr
        };

        const formData = new URLSearchParams();
        formData.append("at", this.accessToken || "");
        formData.append("f.req", JSON.stringify([null, JSON.stringify(innerReqList)]));

        const params = new URLSearchParams();
        params.append('hl', this.language);
        params.append('_reqid', this._reqid.toString());
        params.append('rt', 'c');
        if (this.buildLabel) params.append('bl', this.buildLabel);
        if (this.sessionId) params.append('f.sid', this.sessionId);

        const response = await this.client!.post(Endpoint.GENERATE + '?' + params.toString(), formData.toString(), {
            headers: requestHeaders,
            responseType: 'stream',
            validateStatus: () => true
        });

        if (response.status !== 200) {
            throw new APIError(`Failed to generate contents. Status: ${response.status}`);
        }

        let buffer = "";
        for await (const chunk of response.data) {
            buffer += chunk.toString();
        }

        let finalOutputData: ModelOutput | null = null;
        let parts: any[] = [];
        try {
            let text = buffer;
            if (text.startsWith(")]}'")) {
                text = text.substring(4).trim();
            }
            const jsonMatches = text.match(/\[.*\]/g);
            if (jsonMatches) {
                const largestMatch = jsonMatches.reduce((a, b) => a.length > b.length ? a : b);
                parts = JSON.parse(largestMatch);
            }
        } catch { }

        let outputCid = chat ? chat.cid : "";
        let outputRid = chat ? chat.rid : "";
        const outputCandidates: Candidate[] = [];

        for (const part of parts) {
            const partBodyStr = getNestedValue(part, [2]);
            if (!partBodyStr) continue;

            let partBody: any;
            try {
                partBody = JSON.parse(partBodyStr);
            } catch { continue; }

            const candidatesList = getNestedValue(partBody, [4], []);
            for (let i = 0; i < candidatesList.length; i++) {
                const candidateData = candidatesList[i];
                const rcid = getNestedValue(candidateData, [0]);
                if (!rcid) continue;

                if (chat) chat.rcid = rcid;

                const [textOutput, thoughtsOutput, webImages, generatedImages, generatedVideos, generatedMedia] =
                    this._parseCandidate(candidateData, outputCid, outputRid, rcid);

                let deepResearchPlanObj: DeepResearchPlan | null = null;
                if (deepResearch) {
                    const planData = extractDeepResearchPlan(candidateData, textOutput);
                    if (planData) {
                        deepResearchPlanObj = new DeepResearchPlan(
                            planData.research_id, planData.title, planData.query, planData.steps,
                            planData.eta_text, planData.confirm_prompt, planData.modify_prompt,
                            planData.confirmation_url, chat ? [...chat.metadata] : [], chat ? chat.cid : null,
                            planData.response_text, planData.raw_state
                        );
                    }
                }

                outputCandidates.push(new Candidate(
                    rcid, textOutput, textOutput, thoughtsOutput, thoughtsOutput,
                    webImages, generatedImages, generatedVideos, generatedMedia, deepResearchPlanObj
                ));
            }
        }

        if (outputCandidates.length > 0) {
            finalOutputData = new ModelOutput([outputCid, outputRid], outputCandidates);
            yield finalOutputData;
        }
    }

}

applyMixins(GeminiClient, [ChatMixin, GemMixin, ResearchMixin]);
