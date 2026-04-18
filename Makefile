.PHONY: copy-wasm

copy-wasm:
	mkdir -p public/sui-zk-merkle/pkg
	cp -r ../profile/plugins/sui-zk-merkle/pkg/ public/sui-zk-merkle/pkg/

	mkdir -p public/sui-zk-merkle/wasm
	cp ../profile/public/wasm/zk-merkle.wasm public/sui-zk-merkle/wasm/zk-merkle.wasm
