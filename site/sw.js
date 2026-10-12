/* Hamrah service worker: makes the app open and lessons play without a connection.

   One version of the app is kept whole. The page, its script, styles and the curriculum are
   stored together when this worker is installed and are always served together, so old code
   never meets new lessons. A new version arrives as a new copy of this file: it downloads in
   the background, waits, and takes over when the page says it is a good moment (the home
   screen or the next start — see main.js), not in the middle of a lesson.

   - Audio packs (content-hashed, never change): stored the first time they are used, or all
     at once from Settings. A pack the page fetched while this worker was not yet in charge of
     it (the first moments of the first visit) is stored by the page itself, under the same
     cache name (keepSound in main.js) — so "a lesson opened once works offline" holds then too.
   - Pronunciation-checker files: stored by the page when the learner downloads them.

   Nothing is stored unchecked. On a hotel or clinic Wi-Fi that has not been "accepted" yet, every
   request is answered with the network's login page (200, text/html); a weak connection can cut a
   download short. Such an answer must never be kept as a part of the app or as a lesson's sound —
   it would stay on the phone for good. So every file of the app is compared with its exact size
   and SHA-256 (listed by tools/build.mjs), and every sound pack likewise, before it is stored. A file that fails is not kept (the
   app installs on a later visit; the sound is fetched again on the next tap).

   Nothing stored is served unchecked either. The browser fetches this worker itself from the network, so the
   lists in it cannot be changed from the phone's storage; the stored copies can. Another site on the same address
   (user.github.io/other-project) can open these caches and replace the stored page with its own code, which would
   then run as this app and see what the learner types (QA round 4, security M1). So every stored file of the app,
   every sound pack and every pronunciation-checker file is compared with its listed size and SHA-256 each time it
   is served; a copy that is not the listed file is deleted and fetched afresh (and kept only if that download is
   right). Without a connection a replaced file is simply not served: better a page that says "offline" than
   someone else's code under this app's name.

   Cache names carry the path this copy is served from, so two copies on one origin
   (user.github.io/hamrah and user.github.io/hamrah-test) never touch each other's files. */
const BUILD = '5472303a68';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `hamrah|${SCOPE}|`;
const SHELL = `${PREFIX}shell-${BUILD}`;
const AUDIO = `${PREFIX}audio`;
const ASR = `${PREFIX}asr-c15fea8a96`;
const PRECACHE = ["index.html","app.js","app.css","content.json","manifest.webmanifest","audio/index.json","fonts/atkinson-400.woff2","fonts/atkinson-700.woff2","fonts/vazirmatn-400.woff2","fonts/vazirmatn-600.woff2","fonts/vazirmatn-800.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","audio/core.ddd41a8b.mp3","audio/words.96209872.mp3"];
const INTEGRITY = {"index.html":[3129,"422ed6f0a3c89bdecf8acdea6d0fd384c2d374735f627e02af4519896994f818"],"app.js":[210011,"119c06248accfbbfd66d8c4f62dbfb7867f67f45b8a5a964299ea74b107de94d"],"app.css":[37262,"045023ea0af702d128f553e8a90b3209c0b65d708984f5533a5eadb72aab9bc2"],"content.json":[952952,"45be2974a63f220ff8f62d1d2062c12e779ac0ed094137f72b8bd589902b7158"],"manifest.webmanifest":[694,"28b0d4052b4a1f8d724f3d3a4fa8a96b54e4189fec7fc49cfa667191a1bd56a0"],"audio/index.json":[245619,"57ab5f6ab63566a3d6163dc9452198e837be5966d528ace6ad8f6bdb048d25b9"],"fonts/atkinson-400.woff2":[17208,"d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc"],"fonts/atkinson-700.woff2":[17524,"140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0"],"fonts/vazirmatn-400.woff2":[50684,"e382101336c6eb32cfb31381c027d02d2e0354bad08f6a395d4088beb3db3d91"],"fonts/vazirmatn-600.woff2":[51032,"6a39a3c25eb18503cad590527b95bb5d4062b889a7ebbd3f01b0488d239e0499"],"fonts/vazirmatn-800.woff2":[51120,"cd67558bbca0ad319b89e3b2edb8a914f87f864951d7a9d24e1404cbf3b45b02"],"icons/apple-touch-icon.png":[3363,"a21fec5f82ef103432e67f7134761805675220fb65535139f54fe209a050d09e"],"icons/icon-192.png":[3619,"afbdd5ea469ebc03780e08f1fa3dbe575ba00bb12cafb075e3d3caa4a242d6f5"],"icons/icon-512.png":[9689,"4a33411599dd5dc9c94cffc66aa5840583f159016e48266ec0b6575fd5994656"],"icons/icon-maskable-512.png":[8383,"e7be565014d3969dab192c02c04b86e0a771964e6422e93123c514b1a9a4100b"],"icons/icon.svg":[379,"fa9c14ff771dd3ac8ebc5cf3f24aaa52303618d374537cb5b2c113ad1c34556a"],"audio/core.ddd41a8b.mp3":[437760,"e3ae7bb2fbf9bb4b126129762aaa8f6beebcecd8d1b4e7f47cdd23727086ef10"],"audio/words.96209872.mp3":[2938464,"cc87e255757bee022a727e932c7d48152205de2a9d36eb87ac89fe9cbb742dc6"]};                  // path -> [bytes, sha256 hex], made by tools/build.mjs
const PACK_SUMS = {"audio/core.ddd41a8b.mp3":[437760,"e3ae7bb2fbf9bb4b126129762aaa8f6beebcecd8d1b4e7f47cdd23727086ef10"],"audio/b-patterns.d5cb9791.mp3":[1170720,"d7f4652d44413daf7edf9dae23768c8b041729b1186b4f2f1daa340ab9d72548"],"audio/l-about-me.7b6efc25.mp3":[476928,"2a96410c5d1f5b11b427a856dfdffaa927a78810b1373d8ae566e6472c812cce"],"audio/l-airport-checkin.5283b5c3.mp3":[575856,"c3d64367cbbfe52a937f76cb5ecedd96532c867eb68834628b3d88bf372cb2cc"],"audio/l-airport-officer.c210b303.mp3":[559152,"95b389f10bcc488479a88072033d92b3a4f0ecd12015134b3418ab41d179fef4"],"audio/l-appointment-change.efc5248f.mp3":[633024,"cd0ac1b22ab46cc674fee660b4a2e50c3812fa4ff0b95c63ec792e8f3e2bd280"],"audio/l-ask-help.8441627e.mp3":[415872,"4ccbc2765f8edd719a82111eb72173ec5846cf12c173a3ecf87bfcf74433730d"],"audio/l-at-the-door.de57a4cb.mp3":[428112,"b079ae6b1d77e0c6e9c85494ed9bd20e6508ffb53ac8885b86bccc3a13e353d3"],"audio/l-bank-help.2fcc6275.mp3":[560304,"30816858177606cb1363a467b31051df24f87bfe1802e86fe186580ab8382cbb"],"audio/l-basics-time.3aaf0996.mp3":[501408,"5c04bfc0d9b96f7e1e10ef034f55443c639ed59f04f604a4fcff2a0d01c0a7e9"],"audio/l-benefits-office.25194d68.mp3":[641520,"6585bf5edfa815d2815b067249ccec692d2a72902f6612a9fc3dec82854b2d47"],"audio/l-bus-ride.ba538b0a.mp3":[549360,"b8e298925a0097ff9ac74a037a7962538184f45119e7ecbc39a7eacbfddcb822"],"audio/l-bus-transfer.d77ee404.mp3":[625968,"05dd4d2cf91240afa1ea95e52d16a63416d90d7d83543f9306c8c42b2ef97a7d"],"audio/l-car-accident.075e23a0.mp3":[461376,"cdd2d55a8c23788adddc5f06fb5524c06af488e2fd59fb1bf947d0ce15522472"],"audio/l-card-reader.d279153e.mp3":[529200,"149536f75acef86c385f2181e8f771b69a797054d08db0fc35d4310fc8865ae9"],"audio/l-clinic-checkin.2b21bc08.mp3":[687600,"5c1bb2c292f183cb36f4a019f5b6e38cd24555cb041174b2fe153fe0f700fe86"],"audio/l-clinic-questions.0873450e.mp3":[603504,"ed4c3aaf137e39dab9a361eea5169128efc80eb03783298d82533cc4db54cbf4"],"audio/l-clinic-symptoms.518ea3d3.mp3":[494496,"18b32f0662001f74d7de7c4432b51f1fec0d3112c69cd8fe56a83895a66204c4"],"audio/l-clinic-understand.8f66cb05.mp3":[498096,"3c17678aa5d444002ad70bcc9d7f9747bf892c08e1d520224147b4cc76f3f0f5"],"audio/l-clothes-shopping.18b4e3b7.mp3":[415296,"f10eb098280a9a53f3386506cabe4d0de4e67df8cc87ec39c21013d309778ffd"],"audio/l-coffee-order.390441d2.mp3":[428544,"54785b032ef7ab948de402a7f10ac72835f1e49a2292e6fec5aeddca2c3d1d14"],"audio/l-community-library.5ddb48ce.mp3":[469152,"d0dbf1a71ac28c7605c62c3965057e587cab2d07a49f8262c7fcc0adf247b1dd"],"audio/l-condolences.90e35e94.mp3":[504144,"ad0b3b6b4a37a75d68ef25db2dc4ed7b37cf309af28309f27fc4ec7a9e430ba2"],"audio/l-customer-service.179c098d.mp3":[621360,"f31efae4789b49821f1f750f99c3a59615bcf51d3406b006bd988a46d71de690"],"audio/l-dentist-eye.558e690f.mp3":[509328,"60d3d38729a3867393afffe51cbfa3f0d3d646efa4db4b34d7753582a6f845f0"],"audio/l-dinner-guest.dbc25cfe.mp3":[441792,"90ca488619601476e7f6a2bc30426e5a22496668a0816f2ee121ca4eecbe0b99"],"audio/l-directions-ask.9d5e2751.mp3":[508176,"731290289e55bfe40ae66124e44d735ab88904faf93a127d8e06fc280f0d10af"],"audio/l-doctor-explains.981e60df.mp3":[799056,"955cf7ca2042c6871ce98cae1d80a4448659e907f99d84f921302e26c28ca58d"],"audio/l-driving-car.bdc75684.mp3":[460368,"596499d1deb662b107f340b64dcdda413a4f61fe98c9306d19364ae4ecf957fa"],"audio/l-driving-police.be8b030f.mp3":[705168,"0b472d058cf0a0d644d832312b849e177a75fef2454f1a3d3b372c39c1e25590"],"audio/l-drugstore.e7017acb.mp3":[540432,"3ddb4b4ce445174ef4df8faa468f841e419c76c2528722b7d9be5e8715044db7"],"audio/l-emergency-911.6eff5d3c.mp3":[464688,"f1fbc561237a587bf5229fd9b9c48bbaba6a06282f2befcdddf2d041ab00e2c7"],"audio/l-emergency-room.8a398a8b.mp3":[482256,"fe2ca6b909842acca5eae14e7c1d6ffd7e019a7051c8c009e32b5cb5c8c9fba3"],"audio/l-fill-a-form.c20fe8d6.mp3":[501840,"15a4cb41a41e4b1e2894279e3b1fd7164350487a0ad6ee20447ef5b5ed04b336"],"audio/l-haircut.d8893214.mp3":[471600,"fb098410f740dd5cbb83c38eb53eeb8c1879d5693fa02b9f1e607d04427da66e"],"audio/l-holiday-greetings.e77857b2.mp3":[517968,"6df30e67a8b456cd6efd39da227b64ac3e52587f9df7e56dee0e2d600d0e79a3"],"audio/l-home-repair.1640b0bd.mp3":[497088,"cd03576b450d342ca9e3499fe0af03ac374d917b339c7aa1aea91ad5554c0de4"],"audio/l-immigration-office.fa42af4e.mp3":[580176,"97d5a829fe65461f678961cf9e06e8ac06628ed964d5d2372c7075d8943cda99"],"audio/l-incoming-call.d6982c15.mp3":[524880,"f7ebce81a50163eb0c8f20b85af52142d8086463c85ff22e6a19b810489913aa"],"audio/l-insurance-coverage.29b5cb56.mp3":[600336,"610ce45c8fca245fe13f7d55409e13a15aaf090545610b3dee9ab5a9ba237c62"],"audio/l-job-search.ae5e0dca.mp3":[478368,"f33cc5a1efae953c6c27079978789b3441586476a1c9303a0fbeabf10f0ef4e6"],"audio/l-landlord-rent.f8cef997.mp3":[504720,"9f1d404da48e4e369ae685d235853c515b5810de321a21fb54ebe18c68e4552a"],"audio/l-medicine-instructions.c73c921e.mp3":[520848,"fe79692abc820cc5eb3b8cb7f056eca725ff52866e26a23d9abb61d226c52a4a"],"audio/l-my-address-birthday.c78371ac.mp3":[583344,"f9c487e0c7949f0c106c7d8dc45153e365b8558cf59face9961a208d16a86835"],"audio/l-my-name.ae6f0bce.mp3":[524880,"0fab33b84bbb48fb31ee8fe9340f390248c0e19f5a7fb1e25f314683a6ea3d00"],"audio/l-my-numbers.48343558.mp3":[558720,"f1f3f9d885cf3d797dee46e202d7b7f630a7a90de115c6423fb31349207b5e50"],"audio/l-neighbor-chat.1181c585.mp3":[586800,"11c32519e6aa958a283bab66bcb9fd268533d4c641b42e68befdbe8dcac09467"],"audio/l-office-interpreter.1aa79846.mp3":[496080,"a8bb75b8b612d61a94273d3e41d770da7eecc3a0e35479ddef97542c6f2cff1e"],"audio/l-on-the-plane.bee017ca.mp3":[520704,"b9d87cdd472bfff76798e538402a0228ac954a687ccdd64f9b0683bd1ae206ff"],"audio/l-pay-bill-phone.93b4bcf4.mp3":[609408,"4977d741c476070c64b705e1caf74f19d2f51518375e5de0b0a676e8a3ffad8a"],"audio/l-pharmacy.46bcc435.mp3":[547776,"a3c089a19eb6015b93936c47be3ac292d2923c5d2765af5893d8bf1757603892"],"audio/l-pharmacy-problems.0cba840f.mp3":[647856,"6a6cd078d1282158e7a122a25d3dc6d69f28e8b3c5a365404107a06f936bb6c8"],"audio/l-phone-appointment.96c8cd88.mp3":[754704,"b2582088abfd1defae5247b0125146ddb5dd10c1ec28c7c5a2a38235982538e2"],"audio/l-post-office.5bec1ec2.mp3":[466848,"e2beecbd83890574b89cd947b7254493d0ad042621423ee497dcd7efb9851272"],"audio/l-power-weather.12c4386d.mp3":[644976,"34cf859357a099cc65a892b8564ac1d437ff8bac6bfe0d74ba8a172c263f6e4a"],"audio/l-restaurant-order.0e6a95d1.mp3":[484272,"702e4f128e8b98535e64657a5d02d857799c213c9dc2a1daa6eaef8bd8a3e83f"],"audio/l-sale-shopping.48189b56.mp3":[558432,"e044bacb07ad8c5b08f07d6ca1035b0fba29ae6b15041a0552584ea3b77b20c7"],"audio/l-scam-call.eaac1852.mp3":[631008,"1eaa7c478e3b8bd8e0ea5924b80a0ba87340d4484295ed8fb7c29a3e7604778d"],"audio/l-school-pickup.6b58efcc.mp3":[498384,"128db2b3ab94708f703f6f0a7f537632a1f22321ab894e4ea31701c2cf2016a9"],"audio/l-senior-center.0f411d19.mp3":[783648,"be8918e7c00b7ea9c7b21a88db3525a98cd2ae1653231502f7efb043e802c686"],"audio/l-social-hello.2d4e8421.mp3":[466992,"b5227f8e559e7ca6ef595b76f6db507be950a65e064745731becc596b497ae17"],"audio/l-social-slowly.86c2c47f.mp3":[446256,"655858b2a18342d5bb85a1802ed450eee412dd1134d43b270d930356f9c34647"],"audio/l-store-checkout.9a929bb2.mp3":[526752,"1f5d33f33102161ab131215cb13761c0d6924b8b325f17fc0091e8f56dc30f02"],"audio/l-store-where.b91a9a49.mp3":[449568,"1642386f43cf7a6ec60da1b003ba166667be6fbdfe516f00458dea0f6801c94e"],"audio/l-taxi-ride.f206e61e.mp3":[403344,"e929dc5eb1b0feeba57259b5cc9076267455552ecb18ba7056bec1422b65815d"],"audio/l-urgent-care.688bc2bb.mp3":[630864,"f771fbd2b582f6e3afc94220e8d619cbc32ca68b0cca676062273a79cb8a4468"],"audio/l-wedding-congrats.54d51209.mp3":[467280,"0b4de2788c78f90a701e19665f9c50798228d381d48eb9e330a98d8c2c02d247"],"audio/l-work-bridal.0e92d527.mp3":[539136,"795909c8e8b09a4e92a0ad2a425398a57745fdc899e924d1e9cf6882ceb69383"],"audio/l-work-customers.7d4748ed.mp3":[461952,"65ec802727f643512f8f35715541aaa654ddc120c2efb7cf4c47c5b2b10ac45b"],"audio/l-work-delivery.96154c88.mp3":[528624,"18189364c7e94e5c63c98acfb054378d89e7905fcd04ee6bfa1b4d6c59117430"],"audio/l-work-first-day.9802c54c.mp3":[565632,"1484f24a7467b666cb3d095822b7b9be82e09c17f6b6101fe2b4c83daf579537"],"audio/l-work-maintenance.7ce557b8.mp3":[624096,"00e8ac70c2d810dcaa03e7653ff25c983ccee9a9db99e376de145bf311e5ef63"],"audio/l-work-rideshare.fbe76bf0.mp3":[479664,"b33413e344e4a5ad689834b42704f8df8be5b18c8f61af28a7048f3a2df8a467"],"audio/l-work-tailor.2637190f.mp3":[512784,"d7f300e2400901c457aa96087c68c929426b3c11f987de07acf9852ee4ac1080"],"audio/me.51167c28.mp3":[491472,"87a2ea3718085407799546a0642102aabb705f17b0725a94a3002788e680619d"],"audio/n-numbers.93fed925.mp3":[4563072,"8c425a05817a0467b2c89fe75c3b510de3e86cc387b0bb3c2a8c6037dd84535b"],"audio/papers.2e7faf12.mp3":[2491632,"e1723ad149716790ef5273914089508688e35740305aa580c5b0ef9b410846d9"],"audio/r-rp-911-questions.5b01f622.mp3":[232416,"b3ef2373f376ecc0fb317145130ee055c331f9a4169bd54d065e1283214f3f47"],"audio/r-rp-airport.e5f2737e.mp3":[286416,"e865acd13cfb945977610691cf4f2c6b102eadcb33ced7a3b90db4ab8b153007"],"audio/r-rp-ask-help.4aadffbf.mp3":[429264,"c0114404d00b10f3ae5ac3767e77fb25c73cfb5fba1ce17b39e6f98b7d95c4b1"],"audio/r-rp-bank.6c39b4bc.mp3":[308016,"ab5b8bd1a87788a46d8f377028ed38be12ef7d1ed05a2f724254baa2c79401a8"],"audio/r-rp-benefits.b9939a6a.mp3":[546912,"dede677c5ad3e24f67e4097fa5cf1a8e2e7c411659895d92e5980a6bf190036c"],"audio/r-rp-bill.6b5028d5.mp3":[277344,"f5d4e17458a5f0698fb9e68287abe1d53572cd0f828fe7493794e9578c62aee5"],"audio/r-rp-bridal.fdfd62b0.mp3":[655488,"a3f42ae4d951e6c3128f154a302c00dec5453b9194f235b222627e18f8ea1597"],"audio/r-rp-bus.f29e9cef.mp3":[194400,"384d75c8a4c98ebeb15e6238be0230d230dd8b193b1d2a85aa8dad952fb53eee"],"audio/r-rp-bus-transfer.2496b221.mp3":[350640,"63628a02df8232632b1e48e69d6c4db9a79b91d16e37b90f3cebb81bbe6849d8"],"audio/r-rp-car-accident.19e75842.mp3":[648432,"35cbe6affe0a48c76c7c4026d88acdfb2c7fdc2a13e52a793689182ee632b54a"],"audio/r-rp-car-trouble.c08ec11f.mp3":[397872,"3e7bf5bae723e35169eb2500bdde619b020e096777ccfdf6f5ad99d372e91ef1"],"audio/r-rp-card-reader.238f6589.mp3":[327600,"558f1f00fdc24ac6315cc4d7e3871729d69ec33c3e7af4ff55938d8461aa1a46"],"audio/r-rp-checkin.763ffcec.mp3":[303264,"681107fb256c4756982bf0d6b1f5f401b82c25df1c0751a73a0dbbbb67dce7d9"],"audio/r-rp-clinic.52001e4d.mp3":[197568,"c9a196ebb78f565fcd185a70bda979e8c394c8e279579c0dd427ed9b68517710"],"audio/r-rp-clinic-questions.82a89baa.mp3":[519120,"db891c7e145fc7c4df1df4979ca947379b6ad06f8fc8acda012ce8b560b09b2a"],"audio/r-rp-clothes.ab7d45e7.mp3":[359568,"e80d44b6a863d8712596369c772071f4cfdd849bb1e8b129ddf25a1c688ddf7c"],"audio/r-rp-coffee.d75683fc.mp3":[118944,"a6094cc5e726c42bb96bae586acce44a39a958392cf8c81d841f0cfe5e35c874"],"audio/r-rp-condolence.32320568.mp3":[167472,"315cdb1625122512eaa8ddb403c40973c15de324bc48adddf818aaf2dddb622f"],"audio/r-rp-delivery.0e89ea38.mp3":[526032,"ea6b1a7bfb0991ec00e1dd6a7323629c8ea798dc9c7b54a97e9c6682e674fb7c"],"audio/r-rp-delivery-call.78d941cf.mp3":[552528,"27cb288f2ae382715f9443c8da5caaaa2ac9566854ae10e70e548f78fca2dbe2"],"audio/r-rp-dentist.449a3f1b.mp3":[470736,"b80807c04c4fa78daa0ccfb752c8e157d6ae30818450cc37ffb2f686b01bfd31"],"audio/r-rp-directions.aefa5201.mp3":[557712,"9c0bc665794325f94f592fb575754e33fe4687b7dc59455ed913dc4433ff87e5"],"audio/r-rp-doctor-explains.36b7a686.mp3":[467568,"2ca322a2b5de9184aee811b28980a220e9ade5d4f825fe020143757587370f4a"],"audio/r-rp-door.ef9e40db.mp3":[439488,"8960126b39985db3b7242da59a25f13476923681cd359f109c1a925c626f80d6"],"audio/r-rp-emergency.44435513.mp3":[199008,"6da7087e17d3517f3f26202e005b4035ef1b2c63569bf97297a89687b85903b8"],"audio/r-rp-er.35960457.mp3":[119232,"780f7bfd882c5bcea7bdcd116b0208f500e64548ec7fb0affe0a6f864d9b52b3"],"audio/r-rp-groom.de31f257.mp3":[695520,"7a5472414f4f2a5688a7e7415d4873c8caacd868f943896468a91d4d3780b24c"],"audio/r-rp-holiday-dinner.0bf31ca0.mp3":[271440,"81e5d88896edeb177e11779ada0c9ed198e96d13eb3cdc44ab24eebef845cb45"],"audio/r-rp-home.7b211b62.mp3":[250992,"6701f157aee84d8d9e127e2b42a3a04f6d28ffbd0991786da0cd2a24407ac6fa"],"audio/r-rp-incoming.e559c747.mp3":[332352,"3ca4e7031cc0ee54e7ee9d1c21498044998021e176e0386df119f7a2d8ddfc4f"],"audio/r-rp-insurance.1c15fd05.mp3":[511200,"703ee2878d2e567c533e566b451f96bd2d76dc48d347ee8c03e260cc54f67792"],"audio/r-rp-landlord.420d4601.mp3":[447408,"8812e4eb25eba2381df51eae7d9cc0b9107740993b8e9144863d8034ceb09392"],"audio/r-rp-maintenance.8dc53676.mp3":[542592,"17ce9668a6a9f80dfc9802f55878e28661acde8e464dde87641d2a29f79a9694"],"audio/r-rp-medicine.c87f1a3f.mp3":[68976,"b11fe6872855e60fa66cd4da93dade5c863a401cce9d9f9bbf00d3b3921ee117"],"audio/r-rp-myinfo.72448c71.mp3":[443088,"9ed83412fe55d493a05bccc505bc08e443a348fc61b8b66a61a761752bd376cb"],"audio/r-rp-neighbor.99fc05c9.mp3":[256896,"c07ad77604b11741f00b45be8da61423f4cf6c3c239e22dcf415d26993b6714e"],"audio/r-rp-office.1c49c816.mp3":[361584,"e9ebc4df8431374d27eff7876741b7cabae0fba24b4eada832f238aed56c6cde"],"audio/r-rp-pharmacy.6f487762.mp3":[259632,"6b153ac4e5dda8d8de25f58b003935d11b9580c60195e74fd4433df7b26d7770"],"audio/r-rp-pharmacy-problems.5dec63ac.mp3":[614304,"7ee350b7e9a64fdc2ef35a006772963d709ad15533aa1ab36b1d300cdf75b139"],"audio/r-rp-phone.7d2f3d16.mp3":[201744,"300a634271631797c7db1894fd117c9aaed3757de241d3bf239fe2828f5640f7"],"audio/r-rp-plane.8052a73d.mp3":[266256,"3e41b6204a07af0d38957271c1a2e0b0c55700c5e1db03410166710c8adbb80e"],"audio/r-rp-postoffice.8c5e2257.mp3":[331920,"9814099e134f9f49303b7915b1f9a712415fa0b4038d0a29f7df27515dc45430"],"audio/r-rp-power-outage.174a8986.mp3":[477792,"a94e065cb2f51fa4a6161da8cfa65d78b9ccc4b5f23667e5f87a816ee5342cd8"],"audio/r-rp-restaurant.8ec75c35.mp3":[278640,"3c81a8b7201bd7b9df01ce54a199538841a0b652750b0e5373cc23fefbfb2781"],"audio/r-rp-rideshare.c9459b74.mp3":[599760,"d591e5c5b18210157a0baa211c1bb8b5b659c81c3f3e99e8229022155f56efa4"],"audio/r-rp-sale.516181d6.mp3":[305136,"c146a78b84a0615d872130a761bc7bff80ed1a948d3af8683d069eac3561018f"],"audio/r-rp-salon.76ea467d.mp3":[263088,"b1b4940b0e5fc6cadbc5e8253871ef414d13068ae3512066787ebd90e91929f6"],"audio/r-rp-scam.6a23a35e.mp3":[117936,"e410030d24151d310d68c281408709fbbde5f6cb90b7f810e8ef794ab68b122c"],"audio/r-rp-school.96b99a0a.mp3":[126432,"7719295b312a212140b2632de20ac9b47e60c70cd500af07e5dee3ed8d25faef"],"audio/r-rp-senior-ride.7bf0153e.mp3":[501552,"cb5b1d5f6d2d1d66973dd6026058d24916389e2c01941d4592b2b74f268620c4"],"audio/r-rp-store.b4c458e3.mp3":[353664,"005458611212e3cc668a2bf5341060bfc1c06f38fa9f12cf493e247fc7bb67ee"],"audio/r-rp-support.a56dbba6.mp3":[350928,"c1abe48fc31ea3d5e368fc160aa02fc0af4f40d05d8f593dd59226e25befb28e"],"audio/r-rp-tailor.85153ac1.mp3":[693936,"98af0b63eba98fd3e854602b08920f1cacbc42f36aef3e837d9af18c35c5c3c0"],"audio/r-rp-taxi.5b7944fb.mp3":[321120,"4d21446002fb85f2dc055663323783bcc4e2d350431dad8649c8f1f244ee50ef"],"audio/r-rp-traffic.24285a0e.mp3":[273888,"4d59f98723c851a9132f99c39c5210ffdd4bed57e57541ca3ec863cfd8e20b6e"],"audio/r-rp-unhappy-customer.8cfaf744.mp3":[563328,"06b95f1c4059fc8d67380b1108c5e962e60b3c033e9607dae356911f93094545"],"audio/r-rp-urgent.b6ab57ec.mp3":[187200,"598453a860bed48686a80708c4bd387a9958d9ae530d644c49218f130f9853f5"],"audio/r-rp-wedding.be5da468.mp3":[214128,"6a2b394dc203baa73ab7e71311923cc30e387de91baa7b3519a2e5c2fa90d5de"],"audio/r-rp-work.55b113b7.mp3":[325008,"a61d7a74b593d5f21487cc9e86208abef42f9ad12df37767d0fbbd71bb611f6c"],"audio/v-basics.6fa9ac34.mp3":[82656,"a8a8d532dec20105005ff96625c972219c0694e0380a418bcbc00bcc5365897b"],"audio/v-car.7bb9b9bb.mp3":[154800,"8a9c06fd95fed30660e4af125c57a389e111521e27a5ddb34d3242df2e351d44"],"audio/v-clothes.354bcb70.mp3":[808992,"f2ffa42bd3897f77fa7b968b8ad22c092b69e6a0c1010eeb85889dc4f93631fc"],"audio/v-describe.49c3df5e.mp3":[561168,"683aaa2ecc8a344f8cfea5e9b351df691a2d39c780c0ff9bdd0c72ef21e67288"],"audio/v-family.db702ba1.mp3":[168912,"c215943dda971b2ace6895da465a03e2cfceb1a337a4d6b3f76c0064c92fa273"],"audio/v-food.2ef13f9e.mp3":[660528,"9825f904a079853399c40f2cd075b21d0d9a0ba7a585cc09b6e1c25ece048b7c"],"audio/v-health.02351268.mp3":[830016,"b263aa27d62af63794fd53c1b8cac0dfa59eb9d6d3f1847ba9357014c19d6b6f"],"audio/v-home.f93af8e6.mp3":[609552,"aa333ad0d3ea476e49b1b25a12ca117fec9c546a9b9a3c70fb03163e352daf31"],"audio/v-letters.55cab1da.mp3":[405504,"b06aae702b247af0340c295edda9e4f257b9ada14139fa3ab27800eb23edca06"],"audio/v-little.e75df215.mp3":[549936,"d67fe05d379bcb288b0d7344e4b10d01cad551527e1746eb4b0b086ba71ec367"],"audio/v-money.9110d5b7.mp3":[339552,"41090daa9856b9ac5e9ade8e6caba7a5e10eba038929c6ca73d9ad08950a4f0e"],"audio/v-numbers.abd3895f.mp3":[1157040,"8fece056d81cd8254c0c835d5003fa86d73c45a0f8e1c1b6e53e365903a1576a"],"audio/v-occasions.6b150855.mp3":[185616,"428d5590baf587b9959b8a0421e9bc8e4f74ff5db8de2ea126872de6d502ee51"],"audio/v-papers.cda82e8a.mp3":[401040,"297aa35604aa6108872293df40ed4656025c40524c2f2a0bcad5bfd65032afb8"],"audio/v-people.8048412e.mp3":[129600,"41dd14bdc6a4ecdbd85037538a73823b75e14d3cfa4967db31df4f140c364e34"],"audio/v-places.e44b5101.mp3":[595728,"484095c8f90aed100b1a0031c118ba5d8e7a883cd0c4acfcc4eff34368042678"],"audio/v-safety.cd897c3b.mp3":[189072,"8a86b3811b5e5e0b1049a0e12dea6c1e7ad473f8ad00e45b336c998a594a6379"],"audio/v-signs.9709492e.mp3":[486144,"f8f3311f6d2fad1d3e3bf4559711208b5be6164e91361971b91b4653c92f6d74"],"audio/v-store.6692a8e6.mp3":[245088,"9bd67896c0abb0179859c6108a690246060dbac80084692ebec478afbad45c76"],"audio/v-time.3029de44.mp3":[605952,"b7bd055db44d025fa84510ca2896fb493504bede234607f98b69a8daa9691863"],"audio/v-verbs.08516e9d.mp3":[537696,"66e7fd03440b986b95786064dab8ecda75dab53a6ef20a03c25ee7bd9bc48385"],"audio/v-weather.08a7d6e9.mp3":[197424,"9d2578e10d71892afedfa89aadf3911389edefb8f4737d017a91333455c5b43b"],"audio/v-work.01dd6ee3.mp3":[397296,"70fbf8aea46ba882deba89fb40bb4f6d477f3773111441bf90ee9154e0b41a1a"],"audio/words.96209872.mp3":[2938464,"cc87e255757bee022a727e932c7d48152205de2a9d36eb87ac89fe9cbb742dc6"]};                  // 'audio/<file>' -> [bytes, sha256 hex] of every sound pack of this version
const ASR_FILES = {"MOONSHINE-LICENSE.txt":[13344,"6148d7574a6554b7379b633cfd4c4fe5840c3f548d13bc83e00b52dc6fa00abd"],"ONNXRUNTIME-LICENSE.txt":[1658,"121e4c9d5cf8de3c4a55368c7793966d16cc7ea8548c73f891bbb2a455cce024"],"decoder_model_merged.ort":[30412256,"cf524c4862d36e9e5ab032eddc73637efd822d70e868ac575cf1a46e1e4708a0"],"encoder_model.ort":[13281600,"94e90a4654fc45cdfedb77c4c08e1739f48862998e58fada384b25118134f221"],"ort-wasm-simd-threaded.mjs":[20856,"30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8"],"ort-wasm-simd-threaded.wasm":[11210254,"71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4"],"ort.wasm.min.mjs":[48259,"6ef726f355b791129f7ddf3f62e7877a16b9b777abe87004b8ab306e6b9cf265"],"tokens.txt":[549350,"2870d843e14c1e187bf1913a521562a63b53933814bd7f2145120468f494a049"]};                  // pronunciation-checker file name -> [bytes, sha256 hex] (tools/asr-files.json)
// without these the app cannot start; the rest (fonts, pictures, first sounds) is fetched again on first use if it failed here
const CORE = PRECACHE.filter((u) => !/^(fonts|icons)\/|\.mp3$/.test(u));
const EXTRA = PRECACHE.filter((u) => !CORE.includes(u));
const fresh = (u) => new Request(u, { cache: 'reload' });

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
async function digest(algo, buf) {
  try { return self.crypto && self.crypto.subtle ? hex(await self.crypto.subtle.digest(algo, buf)) : null; } catch { return null; }
}
// Is this the file that was meant? [bytes, hash] as listed; without a hash function only the size can be compared.
async function matches(buf, bytes, algo, hash) {
  if (!buf || buf.byteLength !== bytes) return false;
  const d = await digest(algo, buf);
  return d === null || d.startsWith(hash);
}
const looksLikePage = (res) => /^text\/html/i.test(res.headers.get('Content-Type') || '');
// A response that is stored: the checked bytes, with the type and the length they really have.
const keepable = (buf, res, type) => new Response(buf, { status: 200, headers: { 'Content-Type': type || res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(buf.byteLength) } });

// Fetches a file of the app and returns what may be stored for it, or throws.
async function fetchChecked(u) {
  const res = await fetch(fresh(u));
  if (!res.ok || res.status !== 200 || res.redirected) throw new Error(`${u}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const want = INTEGRITY[u];
  if (!want || !(await matches(buf, want[0], 'SHA-256', want[1]))) throw new Error(`${u}: not the file this version lists`);
  return keepable(buf, res);
}

// What a stored file must be, by its path inside this copy of the site: [bytes, sha256], or null when nothing is listed.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function wanted(path) {
  if (own(INTEGRITY, path)) return INTEGRITY[path];
  if (own(PACK_SUMS, path)) return PACK_SUMS[path];
  if (path.startsWith('asr/') && own(ASR_FILES, path.slice(4))) return ASR_FILES[path.slice(4)];
  return null;
}
// The stored copy of a file, only if it is still exactly the file this version lists. A copy that is not (replaced from
// outside, or damaged) is deleted, and null is returned: the caller then fetches it afresh. A file that nothing lists
// is never served from storage — this version stores only listed files.
async function served(cache, req, path) {
  const hit = await cache.match(req, { ignoreSearch: true });
  if (!hit) return null;
  const want = wanted(path);
  if (want) {
    try { if (await matches(await hit.clone().arrayBuffer(), want[0], 'SHA-256', want[1])) return hit; } catch { /* unreadable: as not right */ }
  }
  try { await cache.delete(req, { ignoreSearch: true }); } catch { /* storage trouble */ }
  return null;
}
// The bytes of a sound pack, if they are that pack: its size and SHA-256 as this version lists them.
async function goodPack(path, buf) {
  const want = wanted(path);
  return !!(want && (await matches(buf, want[0], 'SHA-256', want[1])));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // all or nothing: if one file of the app is not right, this version is not installed now (the browser tries again later)
    const core = await Promise.all(CORE.map(async (u) => [u, await fetchChecked(u)]));
    for (const [u, res] of core) await c.put(u, res);
    await Promise.all(EXTRA.map(async (u) => { try { await c.put(u, await fetchChecked(u)); } catch { /* fetched again on first use */ } }));
    // the very first install starts working at once; an update waits until the page asks for it
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'hamrah:activate') self.skipWaiting();
});

// Earlier versions used cache names shared by the whole origin. Take over only what belongs to this copy.
async function adoptLegacy() {
  for (const name of await caches.keys()) {
    const to = name === 'hamrah-audio-v1' ? AUDIO : name === 'hamrah-asr-v1' ? ASR : /^hamrah-shell-/.test(name) ? '' : null;
    if (to === null) continue;
    const old = await caches.open(name);
    const mine = to ? await caches.open(to) : null;
    for (const req of await old.keys()) {
      if (!req.url.startsWith(self.registration.scope)) continue;
      if (mine) { const res = await old.match(req); if (res) await mine.put(req, res); }
      await old.delete(req);
    }
    if (!(await old.keys()).length) await caches.delete(name);
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { await adoptLegacy(); } catch (err) { /* storage trouble: carry on with what we have */ }
    for (const k of await caches.keys()) {
      if ((k.startsWith(PREFIX + 'shell-') && k !== SHELL) || (k.startsWith(PREFIX + 'asr-') && k !== ASR)) await caches.delete(k);
    }
    // drop audio packs that are no longer part of the curriculum
    try {
      const idx = await (await served(await caches.open(SHELL), 'audio/index.json', 'audio/index.json')).json();
      const keep = new Set(idx.packs.map((p) => new URL('audio/' + p.file, self.registration.scope).href));
      const c = await caches.open(AUDIO);
      for (const req of await c.keys()) {
        if (!keep.has(req.url)) { await c.delete(req); continue; }
        // a login page stored by an earlier version of this worker (before stored sounds were checked)
        const res = await c.match(req);
        if (!res || !/^audio\//i.test(res.headers.get('Content-Type') || '')) await c.delete(req);
        // (any other copy that is not the listed pack is found and replaced when it is next served)
      }
    } catch (err) { /* nothing cached yet */ }
    await self.clients.claim();
  })());
});

const offline = () => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
// Opening the app with no usable stored page and no connection: a short page in Farsi (its text is put here from
// content/ui.fa.json by tools/build.mjs) instead of the English word (QA round 5, usability L5)
const OFFLINE_PAGE = "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>همراه انگلیسی</title><style>body{font:20px/1.8 system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#faf6ee;color:#1d2433}h1{font-size:26px;line-height:1.5}@media (prefers-color-scheme:dark){body{background:#151a24;color:#eef1f6}}</style></head><body><h1>اینترنت وصل نیست</h1><p>برنامه این بار بدون اینترنت باز نشد. وقتی اینترنت وصل شد، دوباره بازش کنید.</p><p>این برنامه تماس نمی‌گیرد. در وضعیت اضطراری، خودتان با تلفن شمارهٔ ۹۱۱ (<bdi>911</bdi>) را بگیرید.</p></body></html>";
const offlinePage = () => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = url.pathname.slice(SCOPE.length);

  // Opening the app: only its own address is answered with the stored page. Any other address
  // (a link to one of the site's files, a mistyped path) goes to the network as it is and is
  // never stored — so no link can replace the stored app with something else.
  if (req.mode === 'navigate') {
    if (path !== '' && path !== 'index.html') return;
    e.respondWith((async () => (await served(await caches.open(SHELL), 'index.html', 'index.html')) || (await again('index.html', req, offlinePage)))());
    return;
  }

  if (/^audio\/.+\.mp3$/.test(path)) {            // cache first: these files never change
    e.respondWith((async () => {
      const hit = (await served(await caches.open(AUDIO), req, path)) || (await served(await caches.open(SHELL), req, path));
      if (hit) return hit;
      const res = await fetch(req);
      if (!res.ok || res.status !== 200 || res.redirected || looksLikePage(res)) return res;
      // stored only if these are the pack's own bytes; either way the page gets what came (src/js/audio.js checks it too)
      const buf = await res.arrayBuffer();
      if (await goodPack(path, buf)) { try { await (await caches.open(AUDIO)).put(req, keepable(buf, res, 'audio/mpeg')); } catch { /* storage full */ } }
      return new Response(buf, { status: res.status, headers: res.headers });
    })());
    return;
  }
  if (path.startsWith('asr/')) {
    e.respondWith((async () => (await served(await caches.open(ASR), req, path)) || fetch(req))());
    return;
  }
  if (path === 'config.json') {                   // the optional live-partner setting: always asked afresh, simply "off" without a connection
    e.respondWith(fetch(req).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // the app's own files: from this version's store; a request that names another version (?v=) goes to the network
  e.respondWith((async () => {
    const v = url.searchParams.get('v');
    if (v && v !== BUILD) return fetch(req).catch(offline);
    const cache = await caches.open(SHELL);
    const hit = await served(cache, req, path);
    if (hit) return hit;
    // not stored (a font or picture that could not be stored at install), or the stored copy was not the right file:
    // stored now if the download is the right file
    if (own(INTEGRITY, path)) return again(path, req);
    try { return await fetch(req); } catch (err) { return offline(); }
  })());
});

// A file of the app that is missing from the store or was not right there: fetched afresh and, if it is the listed
// file, stored and served. Otherwise the network's answer is passed on as it is (never stored), or "offline".
async function again(path, req, fallback = offline) {
  try { const good = await fetchChecked(path); try { await (await caches.open(SHELL)).put(path, good.clone()); } catch { /* storage full */ } return good; } catch { /* not the right file now */ }
  try { return await fetch(req); } catch (err) { return fallback(); }
}
