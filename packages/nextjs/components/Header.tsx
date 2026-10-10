"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, BugAntIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },

  {
    label: "Debug Contracts",
    href: "/debug",
    icon: <BugAntIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const pathname = usePathname();
  const isProfilerPage = ["/", "/compare", "/insights", "/debug"].includes(pathname);

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div
      className={`${isProfilerPage ? "border-b border-white/10 bg-[#07070c]" : "sticky top-0 z-20 navbar min-h-0 shrink-0 justify-between bg-base-100 px-0 shadow-md shadow-secondary sm:px-2 lg:static"}`}
    >
      {isProfilerPage ? (
        <div className="mx-auto flex min-h-[62px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-[-0.04em] text-white">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-md bg-[#315cf5] text-sm font-bold text-white"
              >
                M
              </span>
              MProfiler
            </Link>
            <span className="hidden h-7 border-l border-white/10 sm:block" />
            <span className="hidden items-center gap-2 text-sm text-[#aaa9bb] sm:flex">
              <i className="h-2 w-2 rounded-full bg-emerald-500" />
              Local EVM
            </span>
          </div>
          <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm">
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={`py-[22px] font-semibold transition-colors ${pathname === "/" ? "border-b-2 border-violet-400 text-violet-200" : "text-[#aaa9bb] hover:text-white"}`}
            >
              Profiler
            </Link>
            <Link
              href="/compare"
              aria-current={pathname === "/compare" ? "page" : undefined}
              className={`py-[22px] font-semibold transition-colors ${pathname === "/compare" ? "border-b-2 border-violet-400 text-violet-200" : "text-[#aaa9bb] hover:text-white"}`}
            >
              Compare
            </Link>
            <Link
              href="/insights"
              aria-current={pathname === "/insights" ? "page" : undefined}
              className={`py-[22px] font-semibold transition-colors ${pathname === "/insights" ? "border-b-2 border-violet-400 text-violet-200" : "text-[#aaa9bb] hover:text-white"}`}
            >
              Insights
            </Link>
            <Link
              href="/debug"
              prefetch={false}
              aria-current={pathname === "/debug" ? "page" : undefined}
              className={`py-[22px] font-semibold transition-colors ${pathname === "/debug" ? "border-b-2 border-violet-400 text-violet-200" : "text-[#aaa9bb] hover:text-white"}`}
            >
              Contracts
            </Link>
          </nav>
        </div>
      ) : (
        <>
          <div className="navbar-start w-auto lg:w-1/2">
            <details className="dropdown" ref={burgerMenuRef}>
              <summary className="btn btn-ghost ml-1 hover:bg-transparent lg:hidden">
                <Bars3Icon className="h-1/2" />
              </summary>
              <ul
                className="menu menu-compact dropdown-content mt-3 w-52 rounded-box bg-base-100 p-2 shadow-sm"
                onClick={() => {
                  burgerMenuRef?.current?.removeAttribute("open");
                }}
              >
                <HeaderMenuLinks />
              </ul>
            </details>
            <Link href="/" passHref className="ml-4 mr-6 hidden shrink-0 items-center gap-2 lg:flex">
              <div className="relative flex h-10 w-10">
                <Image alt="SE2 logo" className="cursor-pointer" fill src="/logo.svg" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold leading-tight">Scaffold-ETH</span>
                <span className="text-xs">Ethereum dev stack</span>
              </div>
            </Link>
            <ul className="menu menu-horizontal hidden gap-2 px-1 lg:flex lg:flex-nowrap">
              <HeaderMenuLinks />
            </ul>
          </div>
          <div className="navbar-end mr-4 grow">
            <RainbowKitCustomConnectButton />
            {isLocalNetwork && <FaucetButton />}
          </div>
        </>
      )}
    </div>
  );
};
