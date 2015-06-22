#!/bin/bash
BASE=$(cd "$(dirname "$0")"/../..; pwd)
IP=$(boot2docker ip 2>/dev/null || ifconfig docker0 | awk '/inet /{print $2}')
IMAGE=gagern/phantomjs-ubuntu:14.04

if [[ -z ${IP} ]]; then
    echo "Could not detect IP address of this machine with respect to docker container" >&2
    exit 2
fi

docker run \
       --env baseURL="http://${IP}:7936/" \
       --env dstDir="/KaTeX/test/screenshotter/images/" \
       --volume="${BASE}":/KaTeX \
       "${IMAGE}" /KaTeX/dockers/Phantom/live.js
