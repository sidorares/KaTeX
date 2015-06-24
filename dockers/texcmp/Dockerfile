FROM ubuntu:15.04
MAINTAINER Martin von Gagern <gagern@ma.tum.de>
RUN sed -i 's/^\(deb.*updates\)/#\1/' /etc/apt/sources.list && apt-get update
RUN apt-get -qy --no-install-recommends install \
  texlive-latex-base etoolbox imagemagick ghostscript nodejs
